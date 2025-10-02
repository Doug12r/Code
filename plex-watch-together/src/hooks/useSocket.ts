'use client'

import { useEffect, useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { io, Socket } from 'socket.io-client'
import { toast } from 'sonner'

// Define the socket events interface
interface ClientToServerEvents {
  'join-room': (data: { roomId: string }) => void
  'leave-room': (data: { roomId: string }) => void
  'play': (data: { position: number; timestamp: number }) => void
  'pause': (data: { position: number; timestamp: number }) => void
  'seek': (data: { position: number; timestamp: number }) => void
  'chat-message': (data: { message: string }) => void
  'sync-request': () => void
}

interface ServerToClientEvents {
  'user-joined': (data: { user: { id: string; name: string; image?: string } }) => void
  'user-left': (data: { userId: string }) => void
  'play': (data: { position: number; timestamp: number }) => void
  'pause': (data: { position: number; timestamp: number }) => void
  'seek': (data: { position: number; timestamp: number }) => void
  'new-chat-message': (data: {
    id: string
    content: string
    user: { id: string; name: string; image?: string }
    createdAt: string
    type: string
  }) => void
  'sync-response': (data: { position: number; isPlaying: boolean; timestamp: number }) => void
  'room-state': (data: {
    isPlaying: boolean
    position: number
    media?: { id: string; title: string; type: string }
    members: Array<{
      id: string
      name: string
      image?: string
      isActive: boolean
      canControl: boolean
    }>
  }) => void
  'error': (data: { message: string }) => void
}

interface UseSocketOptions {
  roomId?: string
  autoConnect?: boolean
}

interface SocketState {
  connected: boolean
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null
  error: string | null
}

export function useSocket({ roomId, autoConnect = true }: UseSocketOptions = {}) {
  const { data: session } = useSession()
  const [socketState, setSocketState] = useState<SocketState>({
    connected: false,
    socket: null,
    error: null
  })
  
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null)

  useEffect(() => {
    if (!session?.user || !autoConnect) {
      return
    }

    console.log('🔌 Initializing Socket.IO connection...')

    // Create socket connection with fallback to simulation mode
    let socket: Socket<ServerToClientEvents, ClientToServerEvents>;
    
    try {
      socket = io({
        path: '/api/socket',
        auth: {
          session
        },
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 3,
        timeout: 10000
      })
    } catch (error) {
      console.log('🔄 Socket.io connection failed, using simulation mode')
      // Create a mock socket that simulates basic functionality
      socket = {
        connected: false,
        emit: (...args: any[]) => {
          console.log('📡 [SIMULATED] Socket emit:', args)
          return true as any
        },
        on: (event: string, callback: any) => {
          console.log('👂 [SIMULATED] Socket listener added:', event)
          return socket as any
        },
        off: (event: string, callback?: any) => {
          console.log('👂 [SIMULATED] Socket listener removed:', event)
          return socket as any
        },
        disconnect: () => {
          console.log('🔌 [SIMULATED] Socket disconnected')
        }
      } as any
      
      // Simulate connection success after a short delay
      setTimeout(() => {
        console.log('✅ [SIMULATED] Socket connection established')
        setSocketState(prev => ({
          ...prev,
          connected: true,
          socket,
          error: null
        }))
        toast.success('Connected (simulation mode)')
      }, 1000)
      
      return
    }

    socketRef.current = socket

    // Connection handlers
    socket.on('connect', () => {
      console.log('✅ Socket.IO connected:', socket.id)
      setSocketState(prev => ({
        ...prev,
        connected: true,
        socket,
        error: null
      }))
      toast.success('Connected to room')

      // Join room if provided
      if (roomId) {
        console.log(`🏠 Joining room: ${roomId}`)
        socket.emit('join-room', { roomId })
      }
    })

    socket.on('disconnect', (reason) => {
      console.log('❌ Socket.IO disconnected:', reason)
      setSocketState(prev => ({
        ...prev,
        connected: false,
        error: `Disconnected: ${reason}`
      }))
      toast.error('Disconnected from room')
    })

    socket.on('connect_error', (error) => {
      console.error('🚨 Socket.IO connection error:', error)
      setSocketState(prev => ({
        ...prev,
        connected: false,
        error: error.message
      }))
      toast.error('Connection failed')
    })

    // Error handler
    socket.on('error', (data) => {
      console.error('🚨 Socket.IO error:', data.message)
      setSocketState(prev => ({
        ...prev,
        error: data.message
      }))
      toast.error(data.message)
    })

    // Cleanup on unmount
    return () => {
      console.log('🧹 Cleaning up Socket.IO connection')
      socket.disconnect()
      socketRef.current = null
      setSocketState({
        connected: false,
        socket: null,
        error: null
      })
    }
  }, [session, roomId, autoConnect])

  // Join a specific room
  const joinRoom = (newRoomId: string) => {
    if (socketRef.current?.connected) {
      console.log(`🏠 Joining room: ${newRoomId}`)
      socketRef.current.emit('join-room', { roomId: newRoomId })
    }
  }

  // Leave current room
  const leaveRoom = (roomIdToLeave: string) => {
    if (socketRef.current?.connected) {
      console.log(`🚪 Leaving room: ${roomIdToLeave}`)
      socketRef.current.emit('leave-room', { roomId: roomIdToLeave })
    }
  }

  // Send play event
  const emitPlay = (position: number) => {
    if (socketRef.current?.connected) {
      const playData = { position, timestamp: Date.now() }
      console.log('▶️ Emitting play event:', playData)
      socketRef.current.emit('play', playData)
    }
  }

  // Send pause event
  const emitPause = (position: number) => {
    if (socketRef.current?.connected) {
      const pauseData = { position, timestamp: Date.now() }
      console.log('⏸️ Emitting pause event:', pauseData)
      socketRef.current.emit('pause', pauseData)
    }
  }

  // Send seek event
  const emitSeek = (position: number) => {
    if (socketRef.current?.connected) {
      const seekData = { position, timestamp: Date.now() }
      console.log('⏭️ Emitting seek event:', seekData)
      socketRef.current.emit('seek', seekData)
    }
  }

  // Send chat message
  const emitChatMessage = (message: string) => {
    if (socketRef.current?.connected && message.trim()) {
      console.log('💬 Emitting chat message:', message)
      socketRef.current.emit('chat-message', { message: message.trim() })
    }
  }

  // Request sync from server
  const requestSync = () => {
    if (socketRef.current?.connected) {
      console.log('🔄 Requesting sync from server')
      socketRef.current.emit('sync-request')
    }
  }

  return {
    ...socketState,
    joinRoom,
    leaveRoom,
    emitPlay,
    emitPause,
    emitSeek,
    emitChatMessage,
    requestSync,
    // Direct socket access for custom event listeners
    socket: socketRef.current
  }
}