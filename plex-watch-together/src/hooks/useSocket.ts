'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
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
  enableHealthMonitoring?: boolean
  reconnectionAttempts?: number
  reconnectionDelay?: number
}

interface SocketState {
  connected: boolean
  connecting: boolean
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null
  error: string | null
  latency: number
  quality: 'excellent' | 'good' | 'fair' | 'poor'
  reconnectAttempts: number
}

interface ConnectionHealth {
  latency: number
  quality: string
  recommendation?: string
}

export function useSocket({ 
  roomId, 
  autoConnect = true, 
  enableHealthMonitoring = true,
  reconnectionAttempts = 3,
  reconnectionDelay = 1000
}: UseSocketOptions = {}) {
  const { data: session } = useSession()
  const [socketState, setSocketState] = useState<SocketState>({
    connected: false,
    connecting: false,
    socket: null,
    error: null,
    latency: 0,
    quality: 'excellent',
    reconnectAttempts: 0
  })
  
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null)
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastSyncVersionRef = useRef<number>(0)

  // Enhanced connection health monitoring
  const startHealthMonitoring = useCallback(() => {
    if (!enableHealthMonitoring || !socketRef.current) return
    
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
    }
    
    pingIntervalRef.current = setInterval(() => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('ping' as any, { timestamp: Date.now() })
      }
    }, 5000) // Ping every 5 seconds
  }, [enableHealthMonitoring])

  const stopHealthMonitoring = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!session?.user || !autoConnect) {
      return
    }

    console.log('🔌 Initializing Socket.IO connection...')

    // Create socket connection with fallback to simulation mode
    let socket: Socket<ServerToClientEvents, ClientToServerEvents>;
    
    try {
      setSocketState(prev => ({ ...prev, connecting: true, error: null }))
      
      socket = io({
        path: '/socket.io/',
        auth: {
          session
        },
        autoConnect: true,
        reconnection: true,
        reconnectionDelay,
        reconnectionAttempts,
        timeout: 20000,
        // Enhanced performance settings
        forceNew: false,
        multiplex: true,
        upgrade: true,
        transports: ['websocket', 'polling']
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

    // Enhanced connection handlers
    socket.on('connect', () => {
      console.log('✅ Enhanced Socket.IO connected:', socket.id)
      setSocketState(prev => ({
        ...prev,
        connected: true,
        connecting: false,
        socket,
        error: null,
        reconnectAttempts: 0
      }))
      toast.success('Connected to room')
      
      // Start health monitoring
      startHealthMonitoring()

      // Join room if provided
      if (roomId) {
        console.log(`🏠 Joining room: ${roomId}`)
        socket.emit('join-room', { roomId })
      }
    })

    socket.on('disconnect', (reason) => {
      console.log('❌ Enhanced Socket.IO disconnected:', reason)
      setSocketState(prev => ({
        ...prev,
        connected: false,
        connecting: false,
        error: `Disconnected: ${reason}`
      }))
      stopHealthMonitoring()
      toast.error('Disconnected from room')
    })

    socket.on('connect_error', (error) => {
      console.error('🚨 Enhanced Socket.IO connection error:', error)
      setSocketState(prev => ({
        ...prev,
        connected: false,
        connecting: false,
        error: error.message,
        reconnectAttempts: prev.reconnectAttempts + 1
      }))
      stopHealthMonitoring()
      toast.error('Connection failed')
    })

    // Enhanced health monitoring events
    socket.on('pong' as any, (data: { timestamp: number; serverTime: number }) => {
      const latency = Date.now() - data.timestamp
      const quality = latency < 100 ? 'excellent' : latency < 300 ? 'good' : latency < 500 ? 'fair' : 'poor'
      setSocketState(prev => ({ ...prev, latency, quality }))
    })

    socket.on('connection-quality' as any, (data: ConnectionHealth) => {
      setSocketState(prev => ({ 
        ...prev, 
        latency: data.latency,
        quality: data.quality as any
      }))
    })

    // Enhanced sync conflict handling
    socket.on('sync-conflict' as any, (data: { message: string; currentState: any }) => {
      console.warn('🔄 Sync conflict detected:', data.message)
      // Request sync to get latest state
      socket.emit('sync-request')
    })

    // Enhanced room state updates
    socket.on('room-state', (data: any) => {
      if (data.syncState?.syncVersion) {
        lastSyncVersionRef.current = data.syncState.syncVersion
      }
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
      console.log('🧹 Cleaning up enhanced Socket.IO connection')
      stopHealthMonitoring()
      socket.disconnect()
      socketRef.current = null
      setSocketState({
        connected: false,
        connecting: false,
        socket: null,
        error: null,
        latency: 0,
        quality: 'excellent',
        reconnectAttempts: 0
      })
    }
  }, [session, roomId, autoConnect, startHealthMonitoring, stopHealthMonitoring])

  // Cleanup health monitoring on unmount
  useEffect(() => {
    return () => {
      stopHealthMonitoring()
    }
  }, [stopHealthMonitoring])

  // Enhanced room management with sync versioning
  const joinRoom = useCallback((newRoomId: string) => {
    if (socketRef.current?.connected) {
      console.log(`🏠 Joining enhanced room: ${newRoomId}`)
      socketRef.current.emit('join-room', { roomId: newRoomId })
    }
  }, [])

  const leaveRoom = useCallback((roomIdToLeave: string) => {
    if (socketRef.current?.connected) {
      console.log(`🚪 Leaving room: ${roomIdToLeave}`)
      socketRef.current.emit('leave-room', { roomId: roomIdToLeave })
    }
  }, [])

  // Enhanced media control functions with sync versioning
  const emitPlay = useCallback((position: number) => {
    if (socketRef.current?.connected) {
      const playData = { 
        position, 
        timestamp: Date.now(),
        syncVersion: ++lastSyncVersionRef.current,
        clientTime: Date.now()
      }
      console.log('▶️ Emitting enhanced play event:', playData)
      socketRef.current.emit('play', playData)
    }
  }, [])

  const emitPause = useCallback((position: number) => {
    if (socketRef.current?.connected) {
      const pauseData = { 
        position, 
        timestamp: Date.now(),
        syncVersion: ++lastSyncVersionRef.current,
        clientTime: Date.now()
      }
      console.log('⏸️ Emitting enhanced pause event:', pauseData)
      socketRef.current.emit('pause', pauseData)
    }
  }, [])

  const emitSeek = useCallback((position: number) => {
    if (socketRef.current?.connected) {
      const seekData = { 
        position, 
        timestamp: Date.now(),
        syncVersion: ++lastSyncVersionRef.current,
        clientTime: Date.now()
      }
      console.log('⏭️ Emitting enhanced seek event:', seekData)
      socketRef.current.emit('seek', seekData)
    }
  }, [])

  // Enhanced chat message function
  const emitChatMessage = useCallback((message: string) => {
    if (socketRef.current?.connected && message.trim()) {
      console.log('💬 Emitting enhanced chat message:', message)
      socketRef.current.emit('chat-message', { message: message.trim() })
    }
  }, [])

  // Enhanced sync request with version tracking
  const requestSync = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('🔄 Requesting enhanced sync from server')
      socketRef.current.emit('sync-request')
    }
  }, [])

  return {
    // Enhanced socket state with health monitoring
    ...socketState,
    // Enhanced room management
    joinRoom,
    leaveRoom,
    // Enhanced media controls with sync versioning
    emitPlay,
    emitPause,
    emitSeek,
    // Enhanced communication
    emitChatMessage,
    requestSync,
    // Health monitoring features
    isHealthy: socketState.connected && socketState.latency < 1000,
    connectionQuality: socketState.quality,
    // Direct socket access for custom event listeners
    socket: socketRef.current
  }
}