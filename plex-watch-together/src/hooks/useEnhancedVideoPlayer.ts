'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { enhancedSocketManager, EnhancedSocketState } from '@/lib/enhanced-socket'
import { Socket } from 'socket.io-client'

interface SyncState {
  position: number
  isPlaying: boolean
  timestamp: number
  syncVersion: number
  playbackRate: number
}

interface RoomMember {
  id: string
  userId: string
  username: string
  canControl: boolean
  isHost: boolean
  lastSeen: number
  connectionQuality?: string
}

interface ChatMessage {
  id: string
  userId: string
  username: string
  message: string
  timestamp: number
  type: 'message' | 'system'
}

interface UseEnhancedVideoPlayerOptions {
  roomId: string
  mediaUrl?: string
  canControl?: boolean
  enableBatching?: boolean
  syncTolerance?: number
}

export function useEnhancedVideoPlayer({
  roomId,
  mediaUrl,
  canControl = false,
  enableBatching = true,
  syncTolerance = 2
}: UseEnhancedVideoPlayerOptions) {
  const { data: session } = useSession()
  
  // Enhanced socket state
  const [socketState, setSocketState] = useState<EnhancedSocketState>({
    connected: false,
    connecting: false,
    socket: null,
    metrics: {
      latency: 0,
      packetsLost: 0,
      bandwidth: 0,
      quality: 'excellent',
      jitter: 0,
      reconnections: 0
    },
    isHealthy: false
  })

  // Video player state
  const [syncState, setSyncState] = useState<SyncState>({
    position: 0,
    isPlaying: false,
    timestamp: Date.now(),
    syncVersion: 0,
    playbackRate: 1.0
  })

  // Room state
  const [members, setMembers] = useState<RoomMember[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isBuffering, setIsBuffering] = useState(false)
  const [isSeeking, setIsSeeking] = useState(false)

  // Refs for video control
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastSyncRef = useRef<number>(0)
  const isUserActionRef = useRef<boolean>(false)
  const syncConflictTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize enhanced socket connection
  useEffect(() => {
    if (!session?.user || !roomId) return

    console.log(`🔌 Initializing enhanced socket for room ${roomId}`)
    setSocketState(prev => ({ ...prev, connecting: true }))

    const initSocket = async () => {
      try {
        const socket = await enhancedSocketManager.getSocket(roomId, session)
        
        setSocketState(prev => ({
          ...prev,
          connected: socket.connected,
          connecting: false,
          socket,
          isHealthy: enhancedSocketManager.isHealthy(roomId)
        }))

        setupSocketListeners(socket)
        
        // Update metrics periodically
        const metricsInterval = setInterval(() => {
          const metrics = enhancedSocketManager.getMetrics(roomId)
          const isHealthy = enhancedSocketManager.isHealthy(roomId)
          
          setSocketState(prev => ({
            ...prev,
            metrics,
            isHealthy,
            connected: socket.connected
          }))
        }, 1000)

        return () => {
          clearInterval(metricsInterval)
          enhancedSocketManager.cleanupSocket(roomId)
        }
      } catch (error) {
        console.error('Failed to initialize enhanced socket:', error)
        setSocketState(prev => ({
          ...prev,
          connecting: false,
          connected: false
        }))
      }
    }

    initSocket()

    return () => {
      enhancedSocketManager.cleanupSocket(roomId)
    }
  }, [session, roomId])

  // Setup socket event listeners
  const setupSocketListeners = useCallback((socket: Socket) => {
    // Room state updates
    socket.on('room-state', (data: any) => {
      console.log('📊 Received room state:', data)
      
      if (data.members) {
        setMembers(data.members)
      }
      
      if (data.syncState) {
        const newSyncState = data.syncState
        setSyncState(newSyncState)
        lastSyncRef.current = newSyncState.syncVersion
        
        // Apply sync to video if not user initiated
        if (!isUserActionRef.current && videoRef.current) {
          applySyncToVideo(newSyncState)
        }
      }
    })

    // User events
    socket.on('user-joined', (data: { user: any }) => {
      const newMember: RoomMember = {
        id: `member_${Date.now()}`,
        userId: data.user.id,
        username: data.user.name || data.user.email || 'User',
        canControl: false,
        isHost: false,
        lastSeen: Date.now()
      }
      
      setMembers(prev => [...prev.filter(m => m.userId !== data.user.id), newMember])
      
      const systemMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        userId: 'system',
        username: 'System',
        message: `${newMember.username} joined the room`,
        timestamp: Date.now(),
        type: 'system'
      }
      setChatMessages(prev => [...prev, systemMessage])
    })

    socket.on('user-left', (data: { userId: string }) => {
      setMembers(prev => prev.filter(m => m.userId !== data.userId))
    })

    // Media control events with enhanced sync
    socket.on('play', (data: any) => {
      console.log('▶️ Received play event:', data)
      handleRemoteMediaEvent('play', data)
    })

    socket.on('pause', (data: any) => {
      console.log('⏸️ Received pause event:', data)
      handleRemoteMediaEvent('pause', data)
    })

    socket.on('seek', (data: any) => {
      console.log('⏭️ Received seek event:', data)
      handleRemoteMediaEvent('seek', data)
    })

    // Enhanced sync response with conflict resolution
    socket.on('sync-response', (data: any) => {
      console.log('🔄 Received sync response:', data)
      
      if (data.syncVersion > lastSyncRef.current) {
        setSyncState(data)
        lastSyncRef.current = data.syncVersion
        
        if (videoRef.current && !isUserActionRef.current) {
          applySyncToVideo(data)
        }
      }
    })

    // Sync conflict handling
    socket.on('sync-conflict', (data: { message: string; correctState: SyncState }) => {
      console.warn('⚠️ Sync conflict detected:', data.message)
      
      // Apply correct state after a brief delay to avoid rapid conflicts
      if (syncConflictTimeoutRef.current) {
        clearTimeout(syncConflictTimeoutRef.current)
      }
      
      syncConflictTimeoutRef.current = setTimeout(() => {
        setSyncState(data.correctState)
        lastSyncRef.current = data.correctState.syncVersion
        
        if (videoRef.current) {
          applySyncToVideo(data.correctState)
        }
      }, 200)
    })

    // Chat messages
    socket.on('new-chat-message', (message: ChatMessage) => {
      setChatMessages(prev => [...prev, message])
    })

    // Connection events
    socket.on('connect', () => {
      console.log('✅ Enhanced socket connected')
      setSocketState(prev => ({ ...prev, connected: true, connecting: false }))
    })

    socket.on('disconnect', () => {
      console.log('❌ Enhanced socket disconnected')
      setSocketState(prev => ({ ...prev, connected: false }))
    })

  }, [])

  // Handle remote media events with sync validation
  const handleRemoteMediaEvent = useCallback((event: string, data: any) => {
    // Validate sync version to prevent old events
    if (data.syncVersion && data.syncVersion <= lastSyncRef.current) {
      console.log(`🚫 Ignoring old ${event} event (v${data.syncVersion} <= v${lastSyncRef.current})`)
      return
    }

    const newSyncState: SyncState = {
      position: data.position,
      isPlaying: event === 'play',
      timestamp: data.timestamp || Date.now(),
      syncVersion: data.syncVersion || lastSyncRef.current + 1,
      playbackRate: data.playbackRate || 1.0
    }

    setSyncState(newSyncState)
    lastSyncRef.current = newSyncState.syncVersion

    if (videoRef.current && !isUserActionRef.current) {
      applySyncToVideo(newSyncState)
    }
  }, [])

  // Apply sync state to video element
  const applySyncToVideo = useCallback((state: SyncState) => {
    const video = videoRef.current
    if (!video) return

    console.log(`🎯 Applying sync: pos=${state.position}, playing=${state.isPlaying}`)

    // Calculate expected position based on time elapsed
    const now = Date.now()
    const elapsed = (now - state.timestamp) / 1000
    const expectedPosition = state.position + (state.isPlaying ? elapsed * state.playbackRate : 0)

    // Check if sync is needed
    const currentPosition = video.currentTime
    const positionDiff = Math.abs(currentPosition - expectedPosition)

    if (positionDiff > syncTolerance) {
      console.log(`🔧 Syncing position: ${currentPosition} -> ${expectedPosition} (diff: ${positionDiff}s)`)
      setIsSeeking(true)
      video.currentTime = expectedPosition
      
      setTimeout(() => setIsSeeking(false), 100)
    }

    // Sync play/pause state
    if (state.isPlaying && video.paused) {
      video.play().catch(err => console.error('Error playing video:', err))
    } else if (!state.isPlaying && !video.paused) {
      video.pause()
    }

    // Sync playback rate
    if (video.playbackRate !== state.playbackRate) {
      video.playbackRate = state.playbackRate
    }
  }, [syncTolerance])

  // Enhanced media control functions
  const emitPlay = useCallback(async (position: number) => {
    if (!canControl) return

    isUserActionRef.current = true
    const newSyncState: SyncState = {
      position,
      isPlaying: true,
      timestamp: Date.now(),
      syncVersion: lastSyncRef.current + 1,
      playbackRate: syncState.playbackRate
    }

    setSyncState(newSyncState)
    lastSyncRef.current = newSyncState.syncVersion

    // Use batching for non-critical updates or reliable emit for critical ones
    if (enableBatching) {
      enhancedSocketManager.batchEvent(roomId, 'play', newSyncState, 'high')
    } else {
      await enhancedSocketManager.reliableEmit(roomId, 'play', newSyncState)
    }

    setTimeout(() => { isUserActionRef.current = false }, 500)
  }, [canControl, roomId, enableBatching, syncState.playbackRate])

  const emitPause = useCallback(async (position: number) => {
    if (!canControl) return

    isUserActionRef.current = true
    const newSyncState: SyncState = {
      position,
      isPlaying: false,
      timestamp: Date.now(),
      syncVersion: lastSyncRef.current + 1,
      playbackRate: syncState.playbackRate
    }

    setSyncState(newSyncState)
    lastSyncRef.current = newSyncState.syncVersion

    if (enableBatching) {
      enhancedSocketManager.batchEvent(roomId, 'pause', newSyncState, 'high')
    } else {
      await enhancedSocketManager.reliableEmit(roomId, 'pause', newSyncState)
    }

    setTimeout(() => { isUserActionRef.current = false }, 500)
  }, [canControl, roomId, enableBatching, syncState.playbackRate])

  const emitSeek = useCallback(async (position: number) => {
    if (!canControl) return

    isUserActionRef.current = true
    const newSyncState: SyncState = {
      position,
      isPlaying: syncState.isPlaying,
      timestamp: Date.now(),
      syncVersion: lastSyncRef.current + 1,
      playbackRate: syncState.playbackRate
    }

    setSyncState(newSyncState)
    lastSyncRef.current = newSyncState.syncVersion

    await enhancedSocketManager.reliableEmit(roomId, 'seek', newSyncState)

    setTimeout(() => { isUserActionRef.current = false }, 500)
  }, [canControl, roomId, syncState.isPlaying, syncState.playbackRate])

  // Throttled position updates for performance
  const updatePosition = useCallback((position: number, isPlaying: boolean) => {
    if (enableBatching) {
      enhancedSocketManager.throttledPositionUpdate(roomId, position, isPlaying)
    }
  }, [roomId, enableBatching])

  // Chat functionality
  const sendChatMessage = useCallback(async (message: string) => {
    if (!message.trim()) return

    await enhancedSocketManager.reliableEmit(roomId, 'chat-message', { 
      message: message.trim() 
    })
  }, [roomId])

  // Sync request with enhanced error handling
  const requestSync = useCallback(async () => {
    console.log('🔄 Requesting sync from server')
    const success = await enhancedSocketManager.reliableEmit(roomId, 'sync-request', {})
    
    if (!success) {
      console.warn('⚠️ Sync request failed, retrying...')
      setTimeout(requestSync, 2000)
    }
  }, [roomId])

  // Cleanup
  useEffect(() => {
    return () => {
      if (syncConflictTimeoutRef.current) {
        clearTimeout(syncConflictTimeoutRef.current)
      }
    }
  }, [])

  return {
    // Socket state
    ...socketState,
    
    // Video state
    syncState,
    isBuffering,
    isSeeking,
    
    // Room state
    members,
    chatMessages,
    
    // Video controls
    videoRef,
    emitPlay,
    emitPause,
    emitSeek,
    updatePosition,
    applySyncToVideo,
    
    // Communication
    sendChatMessage,
    requestSync,
    
    // Performance monitoring
    connectionQuality: socketState.metrics.quality,
    latency: socketState.metrics.latency,
    isHealthy: socketState.isHealthy
  }
}