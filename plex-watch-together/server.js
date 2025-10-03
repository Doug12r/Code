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
      origin: process.env.NEXTAUTH_URL || `http://localhost:${port}`,
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
  })

  // Store room states and connection health with better cleanup
  const roomStates = new Map()
  const connectionHealth = new Map()
  let globalSyncVersion = 0
  
  // Periodic cleanup of empty rooms
  const cleanupRooms = () => {
    const emptyRooms = []
    
    for (const [roomId, roomState] of roomStates.entries()) {
      if (!roomState.members || roomState.members.size === 0) {
        emptyRooms.push(roomId)
      }
    }
    
    if (emptyRooms.length > 0) {
      console.log(`🧹 Cleaning up ${emptyRooms.length} empty rooms`)
      emptyRooms.forEach(roomId => roomStates.delete(roomId))
    }
  }
  
  // Clean up empty rooms every 5 minutes
  const roomCleanupInterval = setInterval(cleanupRooms, 5 * 60 * 1000)

  // Basic authentication middleware
  io.use((socket, next) => {
    const session = socket.handshake.auth.session
    if (session?.user?.id) {
      socket.data.userId = session.user.id
      socket.data.user = session.user
      next()
    } else {
      next(new Error('Authentication required'))
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

    // Media controls
    socket.on('play', (data) => {
      const roomId = socket.data.currentRoom
      if (!roomId) return

      const roomState = roomStates.get(roomId)
      if (roomState) {
        roomState.position = data.position
        roomState.timestamp = Date.now()
        roomState.isPlaying = true
        roomState.syncVersion = ++globalSyncVersion

        console.log(`▶️ Play event in room ${roomId} at position ${data.position}`)
        socket.to(roomId).emit('play', {
          ...data,
          syncVersion: roomState.syncVersion,
          serverTime: Date.now()
        })
      }
    })

    socket.on('pause', (data) => {
      const roomId = socket.data.currentRoom
      if (!roomId) return

      const roomState = roomStates.get(roomId)
      if (roomState) {
        roomState.position = data.position
        roomState.timestamp = Date.now()
        roomState.isPlaying = false
        roomState.syncVersion = ++globalSyncVersion

        console.log(`⏸️ Pause event in room ${roomId} at position ${data.position}`)
        socket.to(roomId).emit('pause', {
          ...data,
          syncVersion: roomState.syncVersion,
          serverTime: Date.now()
        })
      }
    })

    socket.on('seek', (data) => {
      const roomId = socket.data.currentRoom
      if (!roomId) return

      const roomState = roomStates.get(roomId)
      if (roomState) {
        roomState.position = data.position
        roomState.timestamp = Date.now()
        roomState.syncVersion = ++globalSyncVersion

        console.log(`⏭️ Seek event in room ${roomId} to position ${data.position}`)
        socket.to(roomId).emit('seek', {
          ...data,
          syncVersion: roomState.syncVersion,
          serverTime: Date.now()
        })
      }
    })

    // Chat messages
    socket.on('chat-message', (data) => {
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
    })

    // Sync request
    socket.on('sync-request', () => {
      const roomId = socket.data.currentRoom
      if (!roomId) return

      const roomState = roomStates.get(roomId)
      if (roomState) {
        socket.emit('sync-response', {
          position: roomState.position,
          isPlaying: roomState.isPlaying,
          timestamp: roomState.timestamp,
          syncVersion: roomState.syncVersion,
          serverTime: Date.now()
        })
      }
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