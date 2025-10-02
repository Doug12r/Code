import { Server as SocketIOServer } from 'socket.io'
import { Server as NetServer } from 'http'
import { NextApiResponse } from 'next'
import { verify } from 'jsonwebtoken'
import { prisma } from '@/lib/prisma'
import { errorLogger } from '@/lib/error-handling'

export type SocketIONextApiResponse = {
  socket: {
    server: NetServer & {
      io?: SocketIOServer
    }
  }
} & NextApiResponse

// Enhanced socket events for watch party functionality
export interface WatchPartyEvents {
  // Connection events
  'user-connected': { userId: string; username: string; timestamp: number }
  'user-disconnected': { userId: string; timestamp: number }
  
  // Room management
  'join-room': { roomId: string; userId: string }
  'leave-room': { roomId: string; userId: string }
  'room-members-updated': { roomId: string; members: RoomMember[] }
  
  // Media synchronization
  'media-selected': { roomId: string; mediaId: string; mediaTitle: string; mediaUrl: string }
  'play': { roomId: string; timestamp: number; currentTime: number }
  'pause': { roomId: string; timestamp: number; currentTime: number }
  'seek': { roomId: string; timestamp: number; currentTime: number; seekTo: number }
  'sync-request': { roomId: string; userId: string }
  'sync-response': { roomId: string; currentTime: number; isPlaying: boolean; timestamp: number }
  
  // Chat system
  'chat-message': ChatMessage
  'chat-message-sent': ChatMessage
  'typing-start': { roomId: string; userId: string; username: string }
  'typing-end': { roomId: string; userId: string }
  
  // Watch party state
  'state-update': WatchPartyState
  'host-changed': { roomId: string; newHostId: string; newHostName: string }
  'permissions-updated': { roomId: string; userId: string; permissions: UserPermissions }
}

interface RoomMember {
  id: string
  userId: string
  username: string
  canControl: boolean
  canInvite: boolean
  isHost: boolean
  connectedAt: number
}

interface ChatMessage {
  id: string
  roomId: string
  userId: string
  username: string
  message: string
  timestamp: number
  type?: 'message' | 'system' | 'media-update'
}

interface UserPermissions {
  canControl: boolean
  canInvite: boolean
  canChat: boolean
  canKick: boolean
}

interface WatchPartyState {
  roomId: string
  mediaId?: string
  mediaTitle?: string
  mediaUrl?: string
  currentTime: number
  isPlaying: boolean
  hostId: string
  lastUpdate: number
  members: RoomMember[]
}

// In-memory store for active room states (in production, use Redis)
const activeRooms = new Map<string, WatchPartyState>()
const userSockets = new Map<string, string>() // userId -> socketId

export function initializeSocketIO(server: NetServer): SocketIOServer {
  const io = new SocketIOServer(server, {
    path: '/api/socket',
    addTrailingSlash: false,
    cors: {
      origin: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling']
  })

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token
      if (!token) {
        return next(new Error('Authentication token required'))
      }

      // Verify JWT token
      const decoded = verify(token, process.env.NEXTAUTH_SECRET!) as any
      if (!decoded.id) {
        return next(new Error('Invalid token'))
      }

      // Get user from database
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, name: true, email: true }
      })

      if (!user) {
        return next(new Error('User not found'))
      }

      // Attach user data to socket
      socket.data = {
        userId: user.id,
        username: user.name || user.email,
        email: user.email
      }

      next()
    } catch (error) {
      errorLogger.log(error instanceof Error ? error : new Error(String(error)), {
        additionalData: { socketId: socket.id, handshake: socket.handshake.auth }
      })
      next(new Error('Authentication failed'))
    }
  })

  io.on('connection', (socket) => {
    const { userId, username } = socket.data
    console.log(`🔌 User ${username} (${userId}) connected: ${socket.id}`)
    
    // Track user socket for direct messaging
    userSockets.set(userId, socket.id)

    // Handle room joining
    socket.on('join-room', async (data: { roomId: string }) => {
      try {
        const { roomId } = data

        // Verify room exists and user has permission
        const roomMember = await prisma.roomMember.findFirst({
          where: { 
            roomId,
            userId
          },
          include: {
            room: true,
            user: { select: { name: true, email: true } }
          }
        })

        if (!roomMember) {
          socket.emit('error', { message: 'Not authorized to join this room' })
          return
        }

        // Join socket room
        await socket.join(roomId)

        // Initialize or get room state
        let roomState = activeRooms.get(roomId)
        if (!roomState) {
          // Find current host (room creator or first with control permissions)
          const hostMember = await prisma.roomMember.findFirst({
            where: { roomId, canControl: true },
            include: { user: { select: { name: true, email: true } } },
            orderBy: { joinedAt: 'asc' }
          })

          roomState = {
            roomId,
            currentTime: 0,
            isPlaying: false,
            hostId: hostMember?.userId || userId,
            lastUpdate: Date.now(),
            members: []
          }
        }

        // Add member to room state
        const memberData: RoomMember = {
          id: socket.id,
          userId,
          username,
          canControl: roomMember.canControl,
          canInvite: roomMember.canInvite,
          isHost: roomState.hostId === userId,
          connectedAt: Date.now()
        }

        roomState.members = roomState.members.filter(m => m.userId !== userId)
        roomState.members.push(memberData)
        activeRooms.set(roomId, roomState)

        // Notify room of new member
        socket.to(roomId).emit('user-connected', {
          userId,
          username,
          timestamp: Date.now()
        })

        // Send current state to new member
        socket.emit('state-update', roomState)

        // Send updated member list to all room members
        io.to(roomId).emit('room-members-updated', {
          roomId,
          members: roomState.members
        })

        console.log(`👥 ${username} joined room ${roomId}`)

      } catch (error) {
        errorLogger.log(error instanceof Error ? error : new Error(String(error)), {
          additionalData: { userId, roomId: data.roomId }
        })
        socket.emit('error', { message: 'Failed to join room' })
      }
    })

    // Handle media control events
    socket.on('play', async (data: { roomId: string; currentTime: number }) => {
      const roomState = activeRooms.get(data.roomId)
      if (!roomState || !canControlMedia(roomState, userId)) {
        socket.emit('error', { message: 'Not authorized to control media' })
        return
      }

      roomState.isPlaying = true
      roomState.currentTime = data.currentTime
      roomState.lastUpdate = Date.now()
      activeRooms.set(data.roomId, roomState)

      // Broadcast to all room members except sender
      socket.to(data.roomId).emit('play', {
        roomId: data.roomId,
        timestamp: roomState.lastUpdate,
        currentTime: data.currentTime
      })

      // Log media event
      await logMediaEvent(data.roomId, userId, 'play', { currentTime: data.currentTime })
    })

    socket.on('pause', async (data: { roomId: string; currentTime: number }) => {
      const roomState = activeRooms.get(data.roomId)
      if (!roomState || !canControlMedia(roomState, userId)) {
        socket.emit('error', { message: 'Not authorized to control media' })
        return
      }

      roomState.isPlaying = false
      roomState.currentTime = data.currentTime
      roomState.lastUpdate = Date.now()
      activeRooms.set(data.roomId, roomState)

      socket.to(data.roomId).emit('pause', {
        roomId: data.roomId,
        timestamp: roomState.lastUpdate,
        currentTime: data.currentTime
      })

      await logMediaEvent(data.roomId, userId, 'pause', { currentTime: data.currentTime })
    })

    socket.on('seek', async (data: { roomId: string; seekTo: number }) => {
      const roomState = activeRooms.get(data.roomId)
      if (!roomState || !canControlMedia(roomState, userId)) {
        socket.emit('error', { message: 'Not authorized to control media' })
        return
      }

      roomState.currentTime = data.seekTo
      roomState.lastUpdate = Date.now()
      activeRooms.set(data.roomId, roomState)

      socket.to(data.roomId).emit('seek', {
        roomId: data.roomId,
        timestamp: roomState.lastUpdate,
        currentTime: data.seekTo,
        seekTo: data.seekTo
      })

      await logMediaEvent(data.roomId, userId, 'seek', { seekTo: data.seekTo })
    })

    // Handle chat messages
    socket.on('chat-message', async (data: Omit<ChatMessage, 'id' | 'timestamp'>) => {
      try {
        // Validate message
        if (!data.message?.trim() || data.message.length > 500) {
          socket.emit('error', { message: 'Invalid message' })
          return
        }

        // Create message
        const message: ChatMessage = {
          id: `msg_${Date.now()}_${userId}`,
          roomId: data.roomId,
          userId,
          username,
          message: data.message.trim(),
          timestamp: Date.now(),
          type: 'message'
        }

        // Store in database
        await prisma.chatMessage.create({
          data: {
            roomId: data.roomId,
            userId,
            content: message.message,
            type: message.type || 'text'
          }
        })

        // Broadcast to all room members
        io.to(data.roomId).emit('chat-message-sent', message)

      } catch (error) {
        errorLogger.log(error instanceof Error ? error : new Error(String(error)), {
          additionalData: { userId, roomId: data.roomId, message: data.message }
        })
        socket.emit('error', { message: 'Failed to send message' })
      }
    })

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`🔌 User ${username} (${userId}) disconnected: ${socket.id}`)
      
      // Remove from user socket tracking
      userSockets.delete(userId)

      // Remove from all room states
      for (const [roomId, roomState] of activeRooms.entries()) {
        const memberIndex = roomState.members.findIndex(m => m.userId === userId)
        if (memberIndex !== -1) {
          roomState.members.splice(memberIndex, 1)
          
          // If this was the host and there are other members, assign new host
          if (roomState.hostId === userId && roomState.members.length > 0) {
            const newHost = roomState.members.find(m => m.canControl) || roomState.members[0]
            if (newHost) {
              roomState.hostId = newHost.userId
              io.to(roomId).emit('host-changed', {
                roomId,
                newHostId: newHost.userId,
                newHostName: newHost.username
              })
            }
          }
          
          // Notify room of disconnection
          socket.to(roomId).emit('user-disconnected', {
            userId,
            timestamp: Date.now()
          })

          // Update member list
          io.to(roomId).emit('room-members-updated', {
            roomId,
            members: roomState.members
          })

          // Clean up empty rooms
          if (roomState.members.length === 0) {
            activeRooms.delete(roomId)
          } else {
            activeRooms.set(roomId, roomState)
          }
        }
      }
    })
  })

  return io
}

// Helper functions
function canControlMedia(roomState: WatchPartyState, userId: string): boolean {
  const member = roomState.members.find(m => m.userId === userId)
  return member?.canControl || member?.isHost || false
}

async function logMediaEvent(roomId: string, userId: string, action: string, data: any) {
  try {
    await prisma.chatMessage.create({
      data: {
        roomId,
        userId,
        content: `${action}: ${JSON.stringify(data)}`,
        type: 'system'
      }
    })
  } catch (error) {
    console.error('Failed to log media event:', error)
  }
}

// Export active rooms for debugging/monitoring
export { activeRooms, userSockets }