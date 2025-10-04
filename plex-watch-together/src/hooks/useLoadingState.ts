import { useState, useCallback, useRef, useEffect } from 'react'

export interface LoadingState {
  isLoading: boolean
  type: 'idle' | 'media' | 'plex' | 'room' | 'transcoding' | 'buffering' | 'sync' | 'error'
  message?: string
  progress?: number
  startTime?: number
  estimatedTime?: number
  canCancel?: boolean
  error?: string
}

export interface LoadingManagerConfig {
  defaultTimeout?: number
  progressUpdateInterval?: number
  enableEstimatedTime?: boolean
}

export class LoadingManager {
  private state: LoadingState = {
    isLoading: false,
    type: 'idle'
  }
  
  private listeners: Set<(state: LoadingState) => void> = new Set()
  private timeoutId: NodeJS.Timeout | null = null
  private progressInterval: NodeJS.Timeout | null = null
  private config: Required<LoadingManagerConfig>

  constructor(config: LoadingManagerConfig = {}) {
    this.config = {
      defaultTimeout: 30000, // 30 seconds
      progressUpdateInterval: 500, // 500ms
      enableEstimatedTime: true,
      ...config
    }
  }

  subscribe(listener: (state: LoadingState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify() {
    this.listeners.forEach(listener => listener({ ...this.state }))
  }

  start(options: {
    type: LoadingState['type']
    message?: string
    timeout?: number
    canCancel?: boolean
    estimatedTime?: number
  }) {
    this.cleanup()
    
    this.state = {
      isLoading: true,
      type: options.type,
      message: options.message,
      progress: 0,
      startTime: Date.now(),
      canCancel: options.canCancel ?? false,
      estimatedTime: options.estimatedTime
    }

    // Set timeout
    const timeout = options.timeout ?? this.config.defaultTimeout
    this.timeoutId = setTimeout(() => {
      this.error('Operation timed out')
    }, timeout)

    // Start progress simulation if no real progress updates
    if (this.config.enableEstimatedTime && options.estimatedTime) {
      this.startProgressSimulation(options.estimatedTime)
    }

    this.notify()
  }

  updateProgress(progress: number, message?: string) {
    if (!this.state.isLoading) return

    this.state.progress = Math.min(100, Math.max(0, progress))
    if (message) {
      this.state.message = message
    }
    
    this.notify()
  }

  updateMessage(message: string) {
    if (!this.state.isLoading) return

    this.state.message = message
    this.notify()
  }

  complete(finalMessage?: string) {
    this.cleanup()
    
    if (finalMessage) {
      this.state.message = finalMessage
      this.state.progress = 100
      this.notify()
      
      // Show completion state briefly
      setTimeout(() => {
        this.state = {
          isLoading: false,
          type: 'idle'
        }
        this.notify()
      }, 1000)
    } else {
      this.state = {
        isLoading: false,
        type: 'idle'
      }
      this.notify()
    }
  }

  error(errorMessage: string) {
    this.cleanup()
    
    this.state = {
      isLoading: false,
      type: 'error',
      error: errorMessage
    }
    
    this.notify()
  }

  cancel() {
    if (!this.state.canCancel) return false

    this.cleanup()
    this.state = {
      isLoading: false,
      type: 'idle'
    }
    
    this.notify()
    return true
  }

  private startProgressSimulation(estimatedTime: number) {
    let elapsed = 0
    
    this.progressInterval = setInterval(() => {
      elapsed += this.config.progressUpdateInterval
      const progress = Math.min(95, (elapsed / estimatedTime) * 100)
      
      this.state.progress = progress
      this.notify()
      
      if (progress >= 95) {
        if (this.progressInterval) {
          clearInterval(this.progressInterval)
          this.progressInterval = null
        }
      }
    }, this.config.progressUpdateInterval)
  }

  private cleanup() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
    
    if (this.progressInterval) {
      clearInterval(this.progressInterval)
      this.progressInterval = null
    }
  }

  getState() {
    return { ...this.state }
  }

  isActive() {
    return this.state.isLoading
  }
}

// React hook for loading state management
export function useLoadingState(config?: LoadingManagerConfig) {
  const managerRef = useRef<LoadingManager | null>(null)
  const [state, setState] = useState<LoadingState>({
    isLoading: false,
    type: 'idle'
  })

  // Initialize manager
  if (!managerRef.current) {
    managerRef.current = new LoadingManager(config)
  }

  // Subscribe to state changes
  useEffect(() => {
    const manager = managerRef.current!
    const unsubscribe = manager.subscribe(setState)
    return unsubscribe
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (managerRef.current) {
        managerRef.current.cancel()
      }
    }
  }, [])

  const startLoading = useCallback((options: {
    type: LoadingState['type']
    message?: string
    timeout?: number
    canCancel?: boolean
    estimatedTime?: number
  }) => {
    managerRef.current?.start(options)
  }, [])

  const updateProgress = useCallback((progress: number, message?: string) => {
    managerRef.current?.updateProgress(progress, message)
  }, [])

  const updateMessage = useCallback((message: string) => {
    managerRef.current?.updateMessage(message)
  }, [])

  const completeLoading = useCallback((finalMessage?: string) => {
    managerRef.current?.complete(finalMessage)
  }, [])

  const errorLoading = useCallback((errorMessage: string) => {
    managerRef.current?.error(errorMessage)
  }, [])

  const cancelLoading = useCallback((): boolean => {
    return managerRef.current?.cancel() ?? false
  }, [])

  return {
    state,
    startLoading,
    updateProgress,
    updateMessage,
    completeLoading,
    errorLoading,
    cancelLoading,
    isLoading: state.isLoading,
    error: state.error
  }
}

// Specialized hooks for common loading scenarios
export function useMediaLoading() {
  const loading = useLoadingState({
    defaultTimeout: 60000, // 1 minute for media operations
    enableEstimatedTime: true
  })

  const loadPlex = useCallback((message = 'Connecting to Plex server...') => {
    loading.startLoading({
      type: 'plex',
      message,
      estimatedTime: 5000,
      canCancel: true
    })
  }, [loading])

  const loadLibrary = useCallback((libraryName?: string) => {
    const message = libraryName 
      ? `Loading ${libraryName} library...`
      : 'Loading media library...'
    
    loading.startLoading({
      type: 'media',
      message,
      estimatedTime: 3000,
      canCancel: true
    })
  }, [loading])

  const loadMedia = useCallback((mediaTitle?: string) => {
    const message = mediaTitle
      ? `Loading ${mediaTitle}...`
      : 'Loading media details...'
    
    loading.startLoading({
      type: 'media',
      message,
      estimatedTime: 2000,
      canCancel: true
    })
  }, [loading])

  return {
    ...loading,
    loadPlex,
    loadLibrary,
    loadMedia
  }
}

export function useRoomLoading() {
  const loading = useLoadingState({
    defaultTimeout: 30000,
    enableEstimatedTime: true
  })

  const joinRoom = useCallback((roomId: string) => {
    loading.startLoading({
      type: 'room',
      message: `Joining room ${roomId}...`,
      estimatedTime: 3000,
      canCancel: true
    })
  }, [loading])

  const createRoom = useCallback((mediaTitle?: string) => {
    const message = mediaTitle
      ? `Creating room for ${mediaTitle}...`
      : 'Creating new room...'
    
    loading.startLoading({
      type: 'room',
      message,
      estimatedTime: 2000,
      canCancel: true
    })
  }, [loading])

  const syncPlayback = useCallback(() => {
    loading.startLoading({
      type: 'sync',
      message: 'Synchronizing playback...',
      estimatedTime: 1000,
      canCancel: false
    })
  }, [loading])

  return {
    ...loading,
    joinRoom,
    createRoom,
    syncPlayback
  }
}

export function useTranscodingLoading() {
  const loading = useLoadingState({
    defaultTimeout: 300000, // 5 minutes for transcoding
    progressUpdateInterval: 1000,
    enableEstimatedTime: false // Real progress from transcoding service
  })

  const startTranscoding = useCallback((mediaTitle: string) => {
    loading.startLoading({
      type: 'transcoding',
      message: `Processing ${mediaTitle}...`,
      canCancel: true
    })
  }, [loading])

  return {
    ...loading,
    startTranscoding
  }
}