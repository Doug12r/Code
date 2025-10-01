import { Server as SocketIOServer } from 'socket.io'
import { Server as NetServer } from 'http'
import { NextApiResponse } from 'next'
// Authentication imports will be used for middleware
import { prisma } from '@/lib/prisma'

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
      methods: ['GET', 'POST']
    }
  })

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

    // Media control events
    socket.on('play', async (data: { position: number; timestamp: number }) => {
      const roomId = socket.data.currentRoom
      if (!roomId) return

      try {
        // Update room state
        await prisma.watchRoom.update({
          where: { id: roomId },
          data: {
            isPlaying: true,
            currentPosition: data.position,
            lastSyncAt: new Date()
          }
        })

        // Log sync event
        await prisma.syncEvent.create({
          data: {
            roomId,
            eventType: 'play',
            position: data.position,
            userId: socket.data.userId
          }
        })

        // Broadcast to all users in room
        socket.to(roomId).emit('play', data)
      } catch (error) {
        console.error('Error handling play event:', error)
      }
    })

    socket.on('pause', async (data: { position: number; timestamp: number }) => {
      const roomId = socket.data.currentRoom
      if (!roomId) return

      try {
        await prisma.watchRoom.update({
          where: { id: roomId },
          data: {
            isPlaying: false,
            currentPosition: data.position,
            lastSyncAt: new Date()
          }
        })

        await prisma.syncEvent.create({
          data: {
            roomId,
            eventType: 'pause',
            position: data.position,
            userId: socket.data.userId
          }
        })

        socket.to(roomId).emit('pause', data)
      } catch (error) {
        console.error('Error handling pause event:', error)
      }
    })

    socket.on('seek', async (data: { position: number; timestamp: number }) => {
      const roomId = socket.data.currentRoom
      if (!roomId) return

      try {
        await prisma.watchRoom.update({
          where: { id: roomId },
          data: {
            currentPosition: data.position,
            lastSyncAt: new Date()
          }
        })

        await prisma.syncEvent.create({
          data: {
            roomId,
            eventType: 'seek',
            position: data.position,
            userId: socket.data.userId
          }
        })

        socket.to(roomId).emit('seek', data)
      } catch (error) {
        console.error('Error handling seek event:', error)
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

    // Sync request event
    socket.on('sync-request', async () => {
      const roomId = socket.data.currentRoom
      if (!roomId) return

      try {
        const room = await prisma.watchRoom.findUnique({
          where: { id: roomId }
        })

        if (room) {
          socket.emit('sync-response', {
            position: room.currentPosition,
            isPlaying: room.isPlaying,
            timestamp: Date.now()
          })
        }
      } catch (error) {
        console.error('Error handling sync request:', error)
      }
    })

    // Disconnect event
    socket.on('disconnect', async () => {
      console.log(`User ${socket.data.user?.name} disconnected:`, socket.id)
      
      const roomId = socket.data.currentRoom
      const userId = socket.data.userId

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

          // Notify other users
          socket.to(roomId).emit('user-left', {
            userId
          })
        } catch (error) {
          console.error('Error handling disconnect:', error)
        }
      }
    })
  })

  return io
}