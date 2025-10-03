'use client'

import { useCallback, useRef, useState, useEffect } from 'react'

interface SyncState {
  position: number
  isPlaying: boolean
  timestamp: number
  syncVersion: number
  playbackRate: number
}

interface SyncConflictResolution {
  strategy: 'server-wins' | 'latest-timestamp' | 'consensus'
  tolerance: number
  maxRetries: number
}

interface DisconnectedUserState {
  userId: string
  lastKnownPosition: number
  disconnectTime: number
  syncVersion: number
  needsRecovery: boolean
}

interface UseSyncRecoveryOptions {
  roomId: string
  syncTolerance?: number
  conflictResolution?: SyncConflictResolution
  recoveryTimeout?: number
  maxDrift?: number
}

export function useSyncRecovery({
  roomId,
  syncTolerance = 2,
  conflictResolution = {
    strategy: 'server-wins',
    tolerance: 1.5,
    maxRetries: 3
  },
  recoveryTimeout = 10000,
  maxDrift = 5
}: UseSyncRecoveryOptions) {
  
  const [currentSyncState, setCurrentSyncState] = useState<SyncState | null>(null)
  const [disconnectedUsers, setDisconnectedUsers] = useState<Map<string, DisconnectedUserState>>(new Map())
  const [syncConflicts, setSyncConflicts] = useState<number>(0)
  const [recoveryInProgress, setRecoveryInProgress] = useState(false)
  
  const lastSyncRef = useRef<SyncState | null>(null)
  const conflictRetries = useRef<Map<string, number>>(new Map())
  const recoveryTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Track disconnected users
  const handleUserDisconnect = useCallback((userId: string, lastState: SyncState) => {
    console.log(`🔄 Tracking disconnected user ${userId} for sync recovery`)
    
    const disconnectedState: DisconnectedUserState = {
      userId,
      lastKnownPosition: lastState.position,
      disconnectTime: Date.now(),
      syncVersion: lastState.syncVersion,
      needsRecovery: true
    }
    
    setDisconnectedUsers(prev => new Map(prev).set(userId, disconnectedState))
    
    // Set recovery timeout
    const timer = setTimeout(() => {
      console.log(`⏰ Recovery timeout for user ${userId}`)
      setDisconnectedUsers(prev => {
        const newMap = new Map(prev)
        newMap.delete(userId)
        return newMap
      })
      recoveryTimers.current.delete(userId)
    }, recoveryTimeout)
    
    recoveryTimers.current.set(userId, timer)
  }, [recoveryTimeout])

  // Handle user reconnection with sync recovery
  const handleUserReconnect = useCallback(async (
    userId: string, 
    currentServerState: SyncState,
    socket: any
  ): Promise<boolean> => {
    const disconnectedState = disconnectedUsers.get(userId)
    if (!disconnectedState) {
      console.log(`ℹ️ No recovery needed for user ${userId}`)
      return true
    }

    console.log(`🔄 Starting sync recovery for user ${userId}`)
    setRecoveryInProgress(true)

    try {
      // Clear recovery timer
      const timer = recoveryTimers.current.get(userId)
      if (timer) {
        clearTimeout(timer)
        recoveryTimers.current.delete(userId)
      }

      // Calculate time elapsed during disconnection
      const disconnectDuration = (Date.now() - disconnectedState.disconnectTime) / 1000
      const expectedPosition = disconnectedState.lastKnownPosition + 
        (currentServerState.isPlaying ? disconnectDuration * currentServerState.playbackRate : 0)

      // Check if sync recovery is needed
      const positionDrift = Math.abs(currentServerState.position - expectedPosition)
      
      if (positionDrift > syncTolerance) {
        console.log(`🎯 Sync recovery needed: drift=${positionDrift}s, tolerance=${syncTolerance}s`)
        
        // Send recovery sync data
        socket.emit('sync-recovery', {
          userId,
          recoveryData: {
            expectedPosition,
            serverPosition: currentServerState.position,
            drift: positionDrift,
            disconnectDuration,
            lastSyncVersion: disconnectedState.syncVersion,
            currentSyncVersion: currentServerState.syncVersion
          },
          recoveryStrategy: conflictResolution.strategy
        })

        // Apply gradual sync if drift is moderate
        if (positionDrift <= maxDrift) {
          await gradualSyncRecovery(socket, currentServerState, expectedPosition)
        } else {
          // Force immediate sync for large drifts
          socket.emit('force-sync', currentServerState)
        }
      }

      // Remove from disconnected users
      setDisconnectedUsers(prev => {
        const newMap = new Map(prev)
        newMap.delete(userId)
        return newMap
      })

      console.log(`✅ Sync recovery completed for user ${userId}`)
      return true

    } catch (error) {
      console.error(`❌ Sync recovery failed for user ${userId}:`, error)
      return false
    } finally {
      setRecoveryInProgress(false)
    }
  }, [disconnectedUsers, syncTolerance, conflictResolution.strategy, maxDrift])

  // Gradual sync recovery to avoid jarring jumps
  const gradualSyncRecovery = useCallback(async (
    socket: any, 
    targetState: SyncState, 
    currentPosition: number
  ) => {
    const drift = targetState.position - currentPosition
    const steps = Math.ceil(Math.abs(drift) / 0.5) // 0.5s steps
    const stepSize = drift / steps
    
    console.log(`🎬 Starting gradual sync recovery: ${steps} steps of ${stepSize}s each`)
    
    for (let i = 0; i < steps; i++) {
      const intermediatePosition = currentPosition + (stepSize * (i + 1))
      
      socket.emit('gradual-sync-step', {
        position: intermediatePosition,
        isPlaying: targetState.isPlaying,
        step: i + 1,
        totalSteps: steps,
        timestamp: Date.now()
      })
      
      // Wait between steps for smooth recovery
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Final sync to exact position
    socket.emit('final-sync', targetState)
  }, [])

  // Detect and resolve sync conflicts
  const detectSyncConflict = useCallback((
    incomingState: SyncState,
    currentState: SyncState
  ): boolean => {
    if (!currentState) return false

    const timeDiff = Math.abs(incomingState.timestamp - currentState.timestamp)
    const positionDiff = Math.abs(incomingState.position - currentState.position)
    const versionDiff = incomingState.syncVersion - currentState.syncVersion

    // Detect conflicts
    const hasTimeConflict = timeDiff > conflictResolution.tolerance * 1000
    const hasPositionConflict = positionDiff > conflictResolution.tolerance
    const hasVersionConflict = versionDiff < 0 || (versionDiff === 0 && timeDiff > 1000)

    return hasTimeConflict || hasPositionConflict || hasVersionConflict
  }, [conflictResolution.tolerance])

  // Resolve sync conflicts using configured strategy
  const resolveSyncConflict = useCallback(async (
    socket: any,
    incomingState: SyncState,
    currentState: SyncState,
    conflictId: string
  ): Promise<SyncState> => {
    console.log(`⚠️ Resolving sync conflict using ${conflictResolution.strategy} strategy`)
    
    const retries = conflictRetries.current.get(conflictId) || 0
    
    if (retries >= conflictResolution.maxRetries) {
      console.warn(`🚫 Max conflict resolution retries reached for ${conflictId}`)
      // Force server state as fallback
      return currentState
    }
    
    conflictRetries.current.set(conflictId, retries + 1)
    setSyncConflicts(prev => prev + 1)

    let resolvedState: SyncState

    switch (conflictResolution.strategy) {
      case 'server-wins':
        console.log('🏆 Server wins conflict resolution')
        resolvedState = currentState
        socket.emit('conflict-resolution', {
          strategy: 'server-wins',
          resolvedState: currentState,
          conflictId
        })
        break

      case 'latest-timestamp':
        console.log('⏰ Latest timestamp wins conflict resolution')
        resolvedState = incomingState.timestamp > currentState.timestamp 
          ? incomingState 
          : currentState
        socket.emit('conflict-resolution', {
          strategy: 'latest-timestamp',
          resolvedState,
          conflictId
        })
        break

      case 'consensus':
        console.log('🤝 Requesting consensus for conflict resolution')
        // Request sync from all connected clients
        socket.emit('consensus-request', {
          states: [incomingState, currentState],
          conflictId
        })
        
        // Wait for consensus response (implement timeout)
        resolvedState = await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            console.log('⏰ Consensus timeout, falling back to server state')
            resolve(currentState)
          }, 3000)
          
          socket.once('consensus-response', (response: { resolvedState: SyncState }) => {
            clearTimeout(timeout)
            resolve(response.resolvedState)
          })
        })
        break

      default:
        resolvedState = currentState
    }

    // Clean up retry counter on successful resolution
    setTimeout(() => {
      conflictRetries.current.delete(conflictId)
    }, 5000)

    return resolvedState
  }, [conflictResolution])

  // Process incoming sync state with conflict detection
  const processSyncState = useCallback(async (
    socket: any,
    incomingState: SyncState
  ): Promise<SyncState> => {
    if (!currentSyncState) {
      setCurrentSyncState(incomingState)
      lastSyncRef.current = incomingState
      return incomingState
    }

    // Detect conflicts
    if (detectSyncConflict(incomingState, currentSyncState)) {
      const conflictId = `conflict_${Date.now()}_${roomId}`
      const resolvedState = await resolveSyncConflict(
        socket, 
        incomingState, 
        currentSyncState, 
        conflictId
      )
      
      setCurrentSyncState(resolvedState)
      lastSyncRef.current = resolvedState
      return resolvedState
    }

    // No conflict - accept incoming state
    setCurrentSyncState(incomingState)
    lastSyncRef.current = incomingState
    return incomingState
  }, [currentSyncState, detectSyncConflict, resolveSyncConflict, roomId])

  // Get sync quality metrics
  const getSyncMetrics = useCallback(() => {
    return {
      conflictCount: syncConflicts,
      disconnectedUsers: disconnectedUsers.size,
      recoveryInProgress,
      lastSyncVersion: currentSyncState?.syncVersion || 0,
      avgLatency: 0, // To be implemented with actual measurements
      syncAccuracy: syncConflicts > 0 ? Math.max(0, 100 - (syncConflicts * 5)) : 100
    }
  }, [syncConflicts, disconnectedUsers.size, recoveryInProgress, currentSyncState])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear all recovery timers
      recoveryTimers.current.forEach(timer => clearTimeout(timer))
      recoveryTimers.current.clear()
    }
  }, [])

  return {
    // State
    currentSyncState,
    syncMetrics: getSyncMetrics(),
    
    // Actions
    handleUserDisconnect,
    handleUserReconnect,
    processSyncState,
    
    // Status
    recoveryInProgress,
    hasConflicts: syncConflicts > 0,
    
    // Utilities
    detectSyncConflict,
    resolveSyncConflict,
    gradualSyncRecovery
  }
}