const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const { Server: SocketIOServer } = require('socket.io')

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = process.env.PORT || 3001

// Fix MaxListenersExceededWarning
process.setMaxListeners(20)

// Create the Next.js app
const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  // Create HTTP server
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('internal server error')
    }
  })

  // Initialize Socket.IO
  const io = new SocketIOServer(server, {
    cors: {
      origin: [
        process.env.NEXTAUTH_URL || `http://localhost:${port}`,
        `https://plexwatch.duckdns.org`,
        `http://localhost:3000`,
        `http://localhost:3001`
      ],
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    allowEIO3: true
  })

  // Enhanced room states and connection health with performance monitoring
  const roomStates = new Map()
  const connectionHealth = new Map()
  const eventBatches = new Map()
  const performanceMetrics = new Map()
  let globalSyncVersion = 0
  
  // Global metrics tracking
  let globalMetrics = {
    socketConnections: 0,
    messageRate: 0,
    eventsPerSecond: 0,
    syncEvents: 0,
    conflictResolutions: 0,
    recoveryEvents: 0,
    lastUpdated: Date.now()
  }
  
  // Event counters for rate calculation
  let eventCounters = {
    messages: 0,
    events: 0,
    lastReset: Date.now()
  }
  
  // Update global metrics every 5 seconds
  setInterval(() => {
    const timeElapsed = (Date.now() - eventCounters.lastReset) / 1000
    globalMetrics.messageRate = Math.round(eventCounters.messages / timeElapsed)
    globalMetrics.eventsPerSecond = Math.round(eventCounters.events / timeElapsed)
    globalMetrics.socketConnections = io.engine.clientsCount
    globalMetrics.lastUpdated = Date.now()
    
    // Reset counters
    eventCounters = {
      messages: 0,
      events: 0,
      lastReset: Date.now()
    }
  }, 5000)
  
  // Enhanced room cleanup with performance tracking
  const cleanupRooms = () => {
    const emptyRooms = []
    const startTime = Date.now()
    
    for (const [roomId, roomState] of roomStates.entries()) {
      if (!roomState.members || roomState.members.size === 0) {
        emptyRooms.push(roomId)
        // Clean up associated data
        eventBatches.delete(roomId)
        performanceMetrics.delete(roomId)
      }
    }
    
    if (emptyRooms.length > 0) {
      console.log(`🧹 Cleaning up ${emptyRooms.length} empty rooms in ${Date.now() - startTime}ms`)
      emptyRooms.forEach(roomId => roomStates.delete(roomId))
    }
  }
  
  // Performance metrics tracking
  const updatePerformanceMetrics = (roomId, eventType, processingTime, success = true) => {
    if (!performanceMetrics.has(roomId)) {
      performanceMetrics.set(roomId, {
        events: {},
        latencies: [],
        errorRate: 0,
        lastUpdated: Date.now()
      })
    }
    
    const metrics = performanceMetrics.get(roomId)
    if (!metrics.events[eventType]) {
      metrics.events[eventType] = { count: 0, totalTime: 0, errors: 0 }
    }
    
    metrics.events[eventType].count++
    metrics.events[eventType].totalTime += processingTime
    if (!success) {
      metrics.events[eventType].errors++
    }
    
    // Track event counters for global metrics
    eventCounters.events++
    if (eventType === 'chat-message') {
      eventCounters.messages++
    }
    
    // Track sync events
    if (['play', 'pause', 'seek'].includes(eventType)) {
      globalMetrics.syncEvents++
    }
    
    metrics.lastUpdated = Date.now()
  }
  
  // Track conflict resolutions
  const trackConflictResolution = (roomId, conflictType, resolution) => {
    globalMetrics.conflictResolutions++
    console.log(`🔧 Conflict resolved in room ${roomId}: ${conflictType} -> ${resolution}`)
  }
  
  // Track recovery events
  const trackRecoveryEvent = (roomId, userId, recoveryType) => {
    globalMetrics.recoveryEvents++
    console.log(`🔄 Recovery event in room ${roomId}: ${userId} -> ${recoveryType}`)
  }

  // Event batching for performance optimization
  const processBatch = (roomId, events) => {
    const roomState = roomStates.get(roomId)
    if (!roomState) return

    // Group events by type for optimization
    const eventGroups = events.reduce((groups, event) => {
      if (!groups[event.type]) groups[event.type] = []
      groups[event.type].push(event)
      return groups
    }, {})

    // Process position updates (keep only the latest)
    if (eventGroups['position-update']) {
      const latest = eventGroups['position-update'].pop()
      roomState.position = latest.data.position
      roomState.isPlaying = latest.data.isPlaying
      roomState.timestamp = latest.data.timestamp
      
      // Broadcast the latest position
      io.to(roomId).emit('position-sync', {
        position: roomState.position,
        isPlaying: roomState.isPlaying,
        timestamp: roomState.timestamp,
        serverTime: Date.now()
      })
    }

    // Process other events normally
    Object.entries(eventGroups).forEach(([type, events]) => {
      if (type !== 'position-update') {
        events.forEach(event => {
          io.to(roomId).emit(type, event.data)
        })
      }
    })
  }
  
  // Clean up empty rooms every 2 minutes (more frequent)
  const roomCleanupInterval = setInterval(cleanupRooms, 2 * 60 * 1000)
  


  // Basic authentication middleware
  io.use((socket, next) => {
    const session = socket.handshake.auth.session
    console.log('🔐 Auth check:', { 
      hasSession: !!session, 
      hasUser: !!session?.user, 
      hasUserId: !!session?.user?.id,
      sessionKeys: session ? Object.keys(session) : [],
      userKeys: session?.user ? Object.keys(session.user) : []
    })
    
    if (session?.user?.id) {
      socket.data.userId = session.user.id
      socket.data.user = session.user
      next()
    } else {
      // Allow connection without authentication for now and handle it gracefully
      console.log('⚠️ Socket connecting without proper session, allowing with guest access')
      socket.data.userId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      socket.data.user = { 
        id: socket.data.userId, 
        name: 'Guest User', 
        image: null 
      }
      next()
    }
  })

  io.on('connection', (socket) => {
    console.log(`✅ User ${socket.data.user?.name || 'Unknown'} connected:`, socket.id)
    
    // Initialize connection health
    connectionHealth.set(socket.id, {
      latency: 0,
      lastPing: Date.now(),
      isHealthy: true,
      joinedAt: Date.now()
    })
    
    // Add error handler for socket
    socket.on('error', (error) => {
      console.error(`❌ Socket error for ${socket.data.user?.name || 'Unknown'}:`, error)
    })

    // Ping/Pong for latency monitoring
    socket.on('ping', (data) => {
      const health = connectionHealth.get(socket.id)
      if (health) {
        health.latency = Date.now() - data.timestamp
        health.lastPing = Date.now()
        health.isHealthy = health.latency < 1000
        
        socket.emit('pong', {
          timestamp: data.timestamp,
          serverTime: Date.now()
        })
        
        socket.emit('connection-quality', {
          latency: health.latency,
          quality: health.latency < 100 ? 'excellent' : 
                  health.latency < 250 ? 'good' : 
                  health.latency < 500 ? 'fair' : 'poor'
        })
      }
    })

    // Join room
    socket.on('join-room', async (data) => {
      try {
        const { roomId } = data
        const userId = socket.data.userId
        
        console.log(`🏠 User ${socket.data.user?.name} joining room: ${roomId}`)
        
        // Join the Socket.IO room
        socket.join(roomId)
        socket.data.currentRoom = roomId

        // Initialize room state if not exists
        if (!roomStates.has(roomId)) {
          roomStates.set(roomId, {
            position: 0,
            timestamp: Date.now(),
            isPlaying: false,
            playbackRate: 1.0,
            syncVersion: 0,
            members: new Set()
          })
        }

        const roomState = roomStates.get(roomId)
        roomState.members.add({
          id: userId,
          name: socket.data.user?.name || 'Anonymous',
          image: socket.data.user?.image,
          socketId: socket.id
        })

        // Notify others
        socket.to(roomId).emit('user-joined', {
          user: socket.data.user
        })

        // Send current room state
        socket.emit('room-state', {
          isPlaying: roomState.isPlaying,
          position: roomState.position,
          members: Array.from(roomState.members),
          syncVersion: roomState.syncVersion
        })

        console.log(`✅ User ${socket.data.user?.name} joined room ${roomId}`)
      } catch (error) {
        console.error('Error joining room:', error)
        socket.emit('error', { message: 'Failed to join room' })
      }
    })

    // Leave room
    socket.on('leave-room', (data) => {
      const { roomId } = data
      socket.leave(roomId)
      
      const roomState = roomStates.get(roomId)
      if (roomState && roomState.members) {
        roomState.members = new Set(Array.from(roomState.members).filter(m => m.socketId !== socket.id))
      }
      
      socket.to(roomId).emit('user-left', { userId: socket.data.userId })
      console.log(`🚪 User ${socket.data.user?.name} left room ${roomId}`)
    })

    // Enhanced media controls with conflict detection and performance tracking
    socket.on('play', (data) => {
      const startTime = Date.now()
      const roomId = socket.data.currentRoom
      if (!roomId) return

      const roomState = roomStates.get(roomId)
      if (roomState) {
        // Check for sync conflicts
        if (data.syncVersion && data.syncVersion <= roomState.syncVersion) {
          console.warn(`⚠️ Play event conflict in room ${roomId}: received v${data.syncVersion}, current v${roomState.syncVersion}`)
          trackConflictResolution(roomId, 'play-outdated', 'rejected')
          socket.emit('sync-conflict', {
            message: 'Outdated play event received',
            correctState: {
              position: roomState.position,
              isPlaying: roomState.isPlaying,
              timestamp: roomState.timestamp,
              syncVersion: roomState.syncVersion,
              playbackRate: roomState.playbackRate || 1.0
            }
          })
          return
        }

        roomState.position = data.position
        roomState.timestamp = Date.now()
        roomState.isPlaying = true
        roomState.syncVersion = data.syncVersion || ++globalSyncVersion
        roomState.playbackRate = data.playbackRate || 1.0

        const responseData = {
          position: data.position,
          timestamp: roomState.timestamp,
          syncVersion: roomState.syncVersion,
          playbackRate: roomState.playbackRate,
          serverTime: Date.now(),
          clientTime: data.clientTime
        }

        console.log(`▶️ Enhanced play event in room ${roomId} at position ${data.position} (v${roomState.syncVersion})`)
        socket.to(roomId).emit('play', responseData)
        
        updatePerformanceMetrics(roomId, 'play', Date.now() - startTime, true)
      }
    })

    socket.on('pause', (data) => {
      const startTime = Date.now()
      const roomId = socket.data.currentRoom
      if (!roomId) return

      const roomState = roomStates.get(roomId)
      if (roomState) {
        // Check for sync conflicts
        if (data.syncVersion && data.syncVersion <= roomState.syncVersion) {
          console.warn(`⚠️ Pause event conflict in room ${roomId}: received v${data.syncVersion}, current v${roomState.syncVersion}`)
          trackConflictResolution(roomId, 'pause-outdated', 'rejected')
          socket.emit('sync-conflict', {
            message: 'Outdated pause event received',
            correctState: {
              position: roomState.position,
              isPlaying: roomState.isPlaying,
              timestamp: roomState.timestamp,
              syncVersion: roomState.syncVersion,
              playbackRate: roomState.playbackRate || 1.0
            }
          })
          return
        }

        roomState.position = data.position
        roomState.timestamp = Date.now()
        roomState.isPlaying = false
        roomState.syncVersion = data.syncVersion || ++globalSyncVersion
        roomState.playbackRate = data.playbackRate || 1.0

        const responseData = {
          position: data.position,
          timestamp: roomState.timestamp,
          syncVersion: roomState.syncVersion,
          playbackRate: roomState.playbackRate,
          serverTime: Date.now(),
          clientTime: data.clientTime
        }

        console.log(`⏸️ Enhanced pause event in room ${roomId} at position ${data.position} (v${roomState.syncVersion})`)
        socket.to(roomId).emit('pause', responseData)
        
        updatePerformanceMetrics(roomId, 'pause', Date.now() - startTime, true)
      }
    })

    socket.on('seek', (data) => {
      const startTime = Date.now()
      const roomId = socket.data.currentRoom
      if (!roomId) return

      const roomState = roomStates.get(roomId)
      if (roomState) {
        // Seek events are always accepted as they represent user intention
        roomState.position = data.position
        roomState.timestamp = Date.now()
        roomState.syncVersion = data.syncVersion || ++globalSyncVersion
        roomState.playbackRate = data.playbackRate || roomState.playbackRate || 1.0

        const responseData = {
          position: data.position,
          timestamp: roomState.timestamp,
          syncVersion: roomState.syncVersion,
          playbackRate: roomState.playbackRate,
          isPlaying: roomState.isPlaying,
          serverTime: Date.now(),
          clientTime: data.clientTime
        }

        console.log(`⏭️ Enhanced seek event in room ${roomId} to position ${data.position} (v${roomState.syncVersion})`)
        socket.to(roomId).emit('seek', responseData)
        
        updatePerformanceMetrics(roomId, 'seek', Date.now() - startTime, true)
      }
    })

    // Enhanced event batching handler
    socket.on('event-batch', (data) => {
      const roomId = socket.data.currentRoom
      if (!roomId || !data.events || !Array.isArray(data.events)) return

      const startTime = Date.now()
      
      try {
        processBatch(roomId, data.events)
        updatePerformanceMetrics(roomId, 'batch-process', Date.now() - startTime, true)
        
        // Send acknowledgment
        socket.emit('batch-ack', { batchId: data.batchId, processed: true })
      } catch (error) {
        console.error(`❌ Error processing batch for room ${roomId}:`, error)
        updatePerformanceMetrics(roomId, 'batch-process', Date.now() - startTime, false)
        socket.emit('batch-ack', { batchId: data.batchId, processed: false, error: error.message })
      }
    })

    // Enhanced position sync with throttling
    socket.on('position-update', (data) => {
      const roomId = socket.data.currentRoom
      if (!roomId) return

      const roomState = roomStates.get(roomId)
      if (roomState) {
        roomState.position = data.position
        roomState.timestamp = Date.now()
        roomState.isPlaying = data.isPlaying

        // Throttle position updates to other clients (broadcast max every 500ms)
        if (!roomState.lastPositionBroadcast || Date.now() - roomState.lastPositionBroadcast > 500) {
          socket.to(roomId).emit('position-sync', {
            position: data.position,
            isPlaying: data.isPlaying,
            timestamp: roomState.timestamp,
            serverTime: Date.now()
          })
          roomState.lastPositionBroadcast = Date.now()
        }
      }
    })

    // Chat messages
    socket.on('chat-message', (data) => {
      const startTime = Date.now()
      const roomId = socket.data.currentRoom
      if (!roomId || !data.message.trim()) return

      const message = {
        id: `msg_${Date.now()}_${socket.id}`,
        content: data.message.trim(),
        user: socket.data.user,
        createdAt: new Date().toISOString(),
        type: 'message'
      }

      console.log(`💬 Chat message in room ${roomId}: ${data.message}`)
      io.to(roomId).emit('new-chat-message', message)
      
      updatePerformanceMetrics(roomId, 'chat-message', Date.now() - startTime, true)
    })

    // Enhanced sync request with conflict detection
    socket.on('sync-request', (data = {}) => {
      const roomId = socket.data.currentRoom
      if (!roomId) return

      const roomState = roomStates.get(roomId)
      if (roomState) {
        const syncResponse = {
          position: roomState.position,
          isPlaying: roomState.isPlaying,
          timestamp: roomState.timestamp,
          syncVersion: roomState.syncVersion,
          playbackRate: roomState.playbackRate || 1.0,
          serverTime: Date.now()
        }

        // Check for sync conflicts
        if (data.clientSyncVersion && data.clientSyncVersion > roomState.syncVersion) {
          console.warn(`⚠️ Sync conflict detected in room ${roomId}: client v${data.clientSyncVersion} > server v${roomState.syncVersion}`)
          
          // Emit conflict resolution
          socket.emit('sync-conflict', {
            message: 'Client sync version is ahead of server',
            correctState: syncResponse
          })
        } else {
          socket.emit('sync-response', syncResponse)
        }
      }
    })

    // Bandwidth testing for connection quality
    socket.on('bandwidth-test-request', () => {
      const testData = {
        size: 1024, // 1KB test packet
        timestamp: Date.now(),
        data: 'x'.repeat(1024)
      }
      socket.emit('bandwidth-test', testData)
    })

    // Disconnect
    socket.on('disconnect', (reason) => {
      console.log(`❌ User ${socket.data.user?.name} disconnected:`, socket.id, 'Reason:', reason)
      
      const roomId = socket.data.currentRoom
      connectionHealth.delete(socket.id)

      if (roomId) {
        const roomState = roomStates.get(roomId)
        if (roomState && roomState.members) {
          roomState.members = new Set(Array.from(roomState.members).filter(m => m.socketId !== socket.id))
        }
        
        socket.to(roomId).emit('user-left', { 
          userId: socket.data.userId,
          reason: reason === 'client namespace disconnect' ? 'left' : 'disconnected'
        })
      }
    })
  })

  // Health monitoring
  setInterval(() => {
    const now = Date.now()
    
    // Clean up stale connections
    for (const [socketId, health] of connectionHealth) {
      if (now - health.lastPing > 90000) {
        const socket = io.sockets.sockets.get(socketId)
        if (socket) {
          console.log(`🧹 Disconnecting stale connection: ${socketId}`)
          socket.disconnect(true)
        }
        connectionHealth.delete(socketId)
      }
    }
  }, 30000)

  // Graceful shutdown handling
  const gracefulShutdown = () => {
    console.log('🛑 Graceful shutdown initiated...')
    
    // Clear intervals
    if (roomCleanupInterval) {
      clearInterval(roomCleanupInterval)
    }
    
    // Clean up room states and connections
    roomStates.clear()
    connectionHealth.clear()
    
    // Close Socket.IO server
    io.close(() => {
      console.log('✅ Socket.IO server closed')
    })
    
    // Close HTTP server
    server.close(() => {
      console.log('✅ HTTP server closed')
      process.exit(0)
    })
    
    // Force close after 10 seconds
    setTimeout(() => {
      console.log('⚠️ Forcing shutdown...')
      process.exit(1)
    }, 10000)
  }

  // Handle shutdown signals
  process.on('SIGTERM', gracefulShutdown)
  process.on('SIGINT', gracefulShutdown)
  process.on('SIGUSR2', gracefulShutdown) // For nodemon

  // Start the server
  server.listen(port, (err) => {
    if (err) throw err
    console.log(`🚀 Server ready on http://${hostname}:${port}`)
    console.log(`🎬 Socket.IO server initialized`)
  })
})