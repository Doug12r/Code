import { Server as SocketIOServer } from 'socket.io'
import { Server as NetServer } from 'http'
import { NextApiResponse } from 'next'
// Authentication imports will be used for middleware
import { prisma } from '@/lib/prisma'
import { getCachingService } from './caching-service'

// Enhanced sync state for sub-second precision
interface SyncState {
  position: number
  timestamp: number
  isPlaying: boolean
  playbackRate: number
  syncVersion: number
}

// Connection health tracking
interface ConnectionHealth {
  latency: number
  lastPing: number
  isHealthy: boolean
  joinedAt: number
}

export type SocketIONextApiResponse = {
  socket: {
    server: NetServer & {
      io?: SocketIOServer
    }
  }
} & NextApiResponse

export interface WatchPartyEvents {
  // Media control events
  play: { position: number; timestamp: number }
  pause: { position: number; timestamp: number }
  seek: { position: number; timestamp: number }
  
  // Room events
  'join-room': { roomId: string }
  'leave-room': { roomId: string }
  'user-joined': { user: { id: string; name: string; image?: string } }
  'user-left': { userId: string }
  
  // Chat events
  'chat-message': { message: string }
  'new-chat-message': {
    id: string
    content: string
    user: { id: string; name: string; image?: string }
    createdAt: string
    type: string
  }
  
  // Sync events
  'sync-request': Record<string, never>
  'sync-response': { position: number; isPlaying: boolean; timestamp: number }
  'media-changed': { mediaId: string; mediaTitle: string; mediaType: string }
  
  // System events
  'error': { message: string }
  'room-state': {
    isPlaying: boolean
    position: number
    media?: {
      id: string
      title: string
      type: string
    }
    members: Array<{
      id: string
      name: string
      image?: string
      isActive: boolean
      canControl: boolean
    }>
  }
}

export function initializeSocketIO(server: NetServer): SocketIOServer {
  const io = new SocketIOServer(server, {
    path: '/api/socket',
    addTrailingSlash: false,
    cors: {
      origin: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    },
    // Enhanced performance settings
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 10000,
    maxHttpBufferSize: 1e6, // 1MB
    allowEIO3: true
  })
  
  // Enhanced caching with Redis and in-memory
  const roomStates = new Map<string, SyncState>() // In-memory for speed
  const connectionHealth = new Map<string, ConnectionHealth>()
  const cache = getCachingService() // Redis cache for persistence
  let globalSyncVersion = 0

  io.use(async (socket, next) => {
    try {
      // Get session from socket handshake
      const session = socket.handshake.auth.session
      if (!session?.user?.id) {
        return next(new Error('Unauthorized'))
      }
      
      socket.data.userId = session.user.id
      socket.data.user = session.user
      next()
    } catch (_error) {
      next(new Error('Authentication failed'))
    }
  })

  io.on('connection', (socket) => {
    console.log(`User ${socket.data.user?.name} connected:`, socket.id)
    
    // Initialize connection health tracking
    connectionHealth.set(socket.id, {
      latency: 0,
      lastPing: Date.now(),
      isHealthy: true,
      joinedAt: Date.now()
    })
    
    // Ping/Pong for latency monitoring
    socket.on('ping', (data: { timestamp: number }) => {
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

    // Join room event
    socket.on('join-room', async (data: { roomId: string }) => {
      try {
        const { roomId } = data
        const userId = socket.data.userId

        // Verify user has access to room
        const roomMember = await prisma.roomMember.findUnique({
          where: {
            userId_roomId: {
              userId,
              roomId
            }
          },
          include: {
            room: {
              include: {
                members: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        image: true
                      }
                    }
                  },
                  where: {
                    isActive: true
                  }
                }
              }
            }
          }
        })

        if (!roomMember) {
          socket.emit('error', { message: 'Access denied to room' })
          return
        }

        // Join the Socket.IO room
        socket.join(roomId)
        socket.data.currentRoom = roomId

        // Update user as active
        await prisma.roomMember.update({
          where: {
            userId_roomId: {
              userId,
              roomId
            }
          },
          data: {
            isActive: true,
            lastSeen: new Date()
          }
        })

        // Notify other users in the room
        socket.to(roomId).emit('user-joined', {
          user: socket.data.user
        })

        // Send current room state to the joining user
        const room = roomMember.room
        socket.emit('room-state', {
          isPlaying: room.isPlaying,
          position: room.currentPosition,
          media: room.currentMediaId ? {
            id: room.currentMediaId,
            title: room.currentMediaTitle || 'Unknown',
            type: room.currentMediaType || 'unknown'
          } : undefined,
          members: room.members.map((member: {
            user: { id: string; name: string | null; image: string | null };
            isActive: boolean;
            canControl: boolean;
          }) => ({
            id: member.user.id,
            name: member.user.name || 'Anonymous',
            image: member.user.image,
            isActive: member.isActive,
            canControl: member.canControl
          }))
        })

      } catch (error) {
        console.error('Error joining room:', error)
        socket.emit('error', { message: 'Failed to join room' })
      }
    })

    // Enhanced media control events with sync versioning
    socket.on('play', async (data: { 
      position: number
      timestamp: number
      playbackRate?: number
      syncVersion?: number 
    }) => {
      const roomId = socket.data.currentRoom
      if (!roomId) return

      try {
        // Get or create room sync state with Redis fallback
        if (!roomStates.has(roomId)) {
          // Try to load from Redis first
          const cachedState = await cache.getSyncState(roomId)
          const defaultState = {
            position: 0,
            timestamp: Date.now(),
            isPlaying: false,
            playbackRate: 1.0,
            syncVersion: 0
          }
          
          const initialState = cachedState || defaultState
          roomStates.set(roomId, initialState)
          
          // Save to Redis if it was a new state
          if (!cachedState) {
            await cache.setSyncState(roomId, initialState)
          }
        }
        
        const currentState = roomStates.get(roomId)!
        const newSyncVersion = ++globalSyncVersion
        
        // Check for sync conflicts
        if (data.syncVersion && data.syncVersion < currentState.syncVersion) {
          socket.emit('sync-conflict', {
            message: 'Outdated sync version',
            currentState,
            serverTime: Date.now()
          })
          return
        }
        
        // Update state
        currentState.position = data.position
        currentState.timestamp = Date.now()
        currentState.isPlaying = true
        currentState.playbackRate = data.playbackRate || 1.0
        currentState.syncVersion = newSyncVersion

        // Persist to Redis cache (for real-time access)
        cache.setSyncState(roomId, currentState).catch(error => 
          console.error('Failed to cache sync state:', error)
        )

        // Persist to database (async)
        prisma.watchRoom.update({
          where: { id: roomId },
          data: {
            isPlaying: true,
            currentPosition: data.position,
            lastSyncAt: new Date()
          }
        }).catch(error => console.error('Failed to persist play state:', error))

        // Log sync event
        prisma.syncEvent.create({
          data: {
            roomId,
            eventType: 'play',
            position: data.position,
            userId: socket.data.userId
          }
        }).catch(error => console.error('Failed to log sync event:', error))

        // Broadcast enhanced event
        socket.to(roomId).emit('play', {
          ...data,
          syncVersion: newSyncVersion,
          serverTime: Date.now()
        })
      } catch (error) {
        console.error('Error handling enhanced play event:', error)
      }
    })

    socket.on('pause', async (data: { 
      position: number
      timestamp: number
      syncVersion?: number 
    }) => {
      const roomId = socket.data.currentRoom
      if (!roomId) return

      try {
        const currentState = roomStates.get(roomId)
        if (!currentState) return
        
        const newSyncVersion = ++globalSyncVersion
        
        // Check for sync conflicts
        if (data.syncVersion && data.syncVersion < currentState.syncVersion) {
          socket.emit('sync-conflict', {
            message: 'Outdated sync version',
            currentState,
            serverTime: Date.now()
          })
          return
        }
        
        // Update state
        currentState.position = data.position
        currentState.timestamp = Date.now()
        currentState.isPlaying = false
        currentState.syncVersion = newSyncVersion

        // Persist to database (async)
        prisma.watchRoom.update({
          where: { id: roomId },
          data: {
            isPlaying: false,
            currentPosition: data.position,
            lastSyncAt: new Date()
          }
        }).catch(error => console.error('Failed to persist pause state:', error))

        prisma.syncEvent.create({
          data: {
            roomId,
            eventType: 'pause',
            position: data.position,
            userId: socket.data.userId
          }
        }).catch(error => console.error('Failed to log sync event:', error))

        socket.to(roomId).emit('pause', {
          ...data,
          syncVersion: newSyncVersion,
          serverTime: Date.now()
        })
      } catch (error) {
        console.error('Error handling enhanced pause event:', error)
      }
    })

    socket.on('seek', async (data: { 
      position: number
      timestamp: number
      syncVersion?: number 
    }) => {
      const roomId = socket.data.currentRoom
      if (!roomId) return

      try {
        const currentState = roomStates.get(roomId)
        if (!currentState) return
        
        const newSyncVersion = ++globalSyncVersion
        
        // Check for sync conflicts
        if (data.syncVersion && data.syncVersion < currentState.syncVersion) {
          socket.emit('sync-conflict', {
            message: 'Outdated sync version',
            currentState,
            serverTime: Date.now()
          })
          return
        }
        
        // Update state
        currentState.position = data.position
        currentState.timestamp = Date.now()
        currentState.syncVersion = newSyncVersion

        // Persist to database (async)
        prisma.watchRoom.update({
          where: { id: roomId },
          data: {
            currentPosition: data.position,
            lastSyncAt: new Date()
          }
        }).catch(error => console.error('Failed to persist seek state:', error))

        prisma.syncEvent.create({
          data: {
            roomId,
            eventType: 'seek',
            position: data.position,
            userId: socket.data.userId
          }
        }).catch(error => console.error('Failed to log sync event:', error))

        socket.to(roomId).emit('seek', {
          ...data,
          syncVersion: newSyncVersion,
          serverTime: Date.now()
        })
      } catch (error) {
        console.error('Error handling enhanced seek event:', error)
      }
    })

    // Chat message event
    socket.on('chat-message', async (data: { message: string }) => {
      const roomId = socket.data.currentRoom
      if (!roomId || !data.message.trim()) return

      try {
        const chatMessage = await prisma.chatMessage.create({
          data: {
            content: data.message.trim(),
            type: 'text',
            userId: socket.data.userId,
            roomId
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true
              }
            }
          }
        })

        // Broadcast to all users in room including sender
        io.to(roomId).emit('new-chat-message', {
          id: chatMessage.id,
          content: chatMessage.content,
          user: chatMessage.user,
          createdAt: chatMessage.createdAt.toISOString(),
          type: chatMessage.type
        })
      } catch (error) {
        console.error('Error handling chat message:', error)
      }
    })

    // Enhanced sync request with cached state
    socket.on('sync-request', async (data: { lastKnownVersion?: number }) => {
      const roomId = socket.data.currentRoom
      if (!roomId) return

      try {
        const roomState = roomStates.get(roomId)
        
        if (roomState) {
          socket.emit('sync-response', {
            ...roomState,
            serverTime: Date.now()
          })
        } else {
          // Fallback to database if not in cache
          const room = await prisma.watchRoom.findUnique({
            where: { id: roomId }
          })

          if (room) {
            const fallbackState = {
              position: room.currentPosition,
              isPlaying: room.isPlaying,
              timestamp: Date.now(),
              playbackRate: 1.0,
              syncVersion: 0
            }
            
            roomStates.set(roomId, fallbackState)
            
            socket.emit('sync-response', {
              ...fallbackState,
              serverTime: Date.now()
            })
          }
        }
      } catch (error) {
        console.error('Error handling enhanced sync request:', error)
      }
    })

    // Enhanced disconnect event with cleanup
    socket.on('disconnect', async (reason) => {
      console.log(`User ${socket.data.user?.name} disconnected:`, socket.id, 'Reason:', reason)
      
      const roomId = socket.data.currentRoom
      const userId = socket.data.userId
      
      // Clean up connection health
      connectionHealth.delete(socket.id)

      if (roomId && userId) {
        try {
          // Update user as inactive
          await prisma.roomMember.updateMany({
            where: {
              userId,
              roomId
            },
            data: {
              isActive: false,
              lastSeen: new Date()
            }
          })

          // Notify other users with enhanced info
          socket.to(roomId).emit('user-left', {
            userId,
            reason: reason === 'client namespace disconnect' ? 'left' : 'disconnected',
            timestamp: Date.now()
          })
        } catch (error) {
          console.error('Error handling enhanced disconnect:', error)
        }
      }
    })
  })

  // Health monitoring and cleanup intervals
  setInterval(() => {
    const now = Date.now()
    
    // Check for stale connections
    for (const [socketId, health] of connectionHealth) {
      if (now - health.lastPing > 90000) { // 90 seconds without ping
        const socket = io.sockets.sockets.get(socketId)
        if (socket) {
          console.log(`Disconnecting stale connection: ${socketId}`)
          socket.disconnect(true)
        }
        connectionHealth.delete(socketId)
      }
    }
    
    // Clean up empty room states
    for (const [roomId, state] of roomStates) {
      if (now - state.timestamp > 3600000) { // 1 hour old
        const roomSockets = io.sockets.adapter.rooms.get(roomId)
        if (!roomSockets || roomSockets.size === 0) {
          roomStates.delete(roomId)
          console.log(`Cleaned up empty room state: ${roomId}`)
        }
      }
    }
  }, 30000) // Every 30 seconds

  console.log('🎬 Enhanced Socket.IO server initialized with real-time sync features')
  
  return io
}