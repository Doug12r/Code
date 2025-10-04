'use client'

import React, { useEffect, useState } from 'react'

export interface OfflineManager {
  isOnline: boolean
  isServiceWorkerSupported: boolean
  isServiceWorkerRegistered: boolean
  pendingActions: number
  registerServiceWorker: () => Promise<void>
  queueAction: (action: OfflineAction) => void
  syncPendingActions: () => Promise<void>
  clearCache: () => Promise<void>
  getCacheInfo: () => Promise<CacheInfo>
}

export interface OfflineAction {
  id: string
  type: 'room-action' | 'media-progress' | 'user-preferences'
  data: any
  timestamp: number
  retryCount?: number
}

export interface CacheInfo {
  totalSize: number
  entryCount: number
  lastUpdated: Date
  mediaCount: number
  apiCount: number
}

export function useOfflineManager(): OfflineManager {
  const [isOnline, setIsOnline] = useState(true)
  const [isServiceWorkerSupported, setIsServiceWorkerSupported] = useState(false)
  const [isServiceWorkerRegistered, setIsServiceWorkerRegistered] = useState(false)
  const [pendingActions, setPendingActions] = useState(0)

  useEffect(() => {
    // Check initial online status
    setIsOnline(navigator.onLine)

    // Check service worker support
    setIsServiceWorkerSupported('serviceWorker' in navigator)

    // Set up online/offline listeners
    const handleOnline = () => {
      setIsOnline(true)
      console.log('🌐 Connection restored')
      
      // Trigger background sync when coming online
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(registration => {
          if ('sync' in registration) {
            ;(registration as any).sync.register('room-actions-sync')
            ;(registration as any).sync.register('media-progress-sync')
            ;(registration as any).sync.register('user-preferences-sync')
          }
        })
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
      console.log('📱 Connection lost - switching to offline mode')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Auto-register service worker
    if ('serviceWorker' in navigator) {
      registerServiceWorker()
    }

    // Update pending actions count
    updatePendingActionsCount()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const registerServiceWorker = async (): Promise<void> => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker not supported')
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      })

      console.log('✅ Service Worker registered:', registration.scope)
      setIsServiceWorkerRegistered(true)

      // Listen for service worker updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('🔄 New service worker available')
              // Optionally show update notification
              showUpdateNotification(registration)
            }
          })
        }
      })

      // Handle messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        handleServiceWorkerMessage(event.data)
      })

    } catch (error) {
      console.error('❌ Service Worker registration failed:', error)
      throw error
    }
  }

  const queueAction = (action: OfflineAction): void => {
    console.log('📝 Queueing offline action:', action.type)
    
    const existingActions = getStoredActions(action.type)
    const updatedActions = [...existingActions, action]
    
    localStorage.setItem(`offline-${action.type}`, JSON.stringify(updatedActions))
    setPendingActions(prev => prev + 1)

    // Try to sync immediately if online
    if (isOnline) {
      syncPendingActions()
    }
  }

  const syncPendingActions = async (): Promise<void> => {
    if (!isOnline) {
      console.log('📱 Offline - skipping sync')
      return
    }

    console.log('🔄 Syncing pending offline actions...')
    
    try {
      const actionTypes = ['room-action', 'media-progress', 'user-preferences']
      
      for (const type of actionTypes) {
        const actions = getStoredActions(type)
        
        if (actions.length === 0) continue

        const successful: string[] = []
        
        for (const action of actions) {
          try {
            await syncSingleAction(action)
            successful.push(action.id)
          } catch (error) {
            console.error(`Failed to sync action ${action.id}:`, error)
            
            // Increment retry count
            action.retryCount = (action.retryCount || 0) + 1
            
            // Remove action if max retries exceeded
            if (action.retryCount >= 3) {
              successful.push(action.id) // Remove from queue
              console.warn(`Action ${action.id} exceeded max retries`)
            }
          }
        }

        // Remove successful actions
        if (successful.length > 0) {
          const remainingActions = actions.filter(
            action => !successful.includes(action.id)
          )
          localStorage.setItem(`offline-${type}`, JSON.stringify(remainingActions))
        }
      }

      updatePendingActionsCount()
      console.log('✅ Offline actions sync completed')

    } catch (error) {
      console.error('❌ Failed to sync offline actions:', error)
    }
  }

  const clearCache = async (): Promise<void> => {
    if (!('caches' in window)) {
      throw new Error('Cache API not supported')
    }

    const cacheNames = await caches.keys()
    await Promise.all(
      cacheNames.map(cacheName => caches.delete(cacheName))
    )

    console.log('🗑️ All caches cleared')
  }

  const getCacheInfo = async (): Promise<CacheInfo> => {
    if (!('caches' in window)) {
      return {
        totalSize: 0,
        entryCount: 0,
        lastUpdated: new Date(),
        mediaCount: 0,
        apiCount: 0
      }
    }

    const cacheNames = await caches.keys()
    let totalSize = 0
    let entryCount = 0
    let mediaCount = 0
    let apiCount = 0
    let lastUpdated = new Date(0)

    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName)
      const keys = await cache.keys()
      entryCount += keys.length

      for (const request of keys) {
        const response = await cache.match(request)
        if (response) {
          const size = parseInt(response.headers.get('content-length') || '0')
          totalSize += size

          // Categorize by request type
          if (isMediaURL(request.url)) {
            mediaCount++
          } else if (isAPIURL(request.url)) {
            apiCount++
          }

          // Check last modified date
          const lastModified = response.headers.get('last-modified')
          if (lastModified) {
            const date = new Date(lastModified)
            if (date > lastUpdated) {
              lastUpdated = date
            }
          }
        }
      }
    }

    return {
      totalSize,
      entryCount,
      lastUpdated: lastUpdated.getTime() === 0 ? new Date() : lastUpdated,
      mediaCount,
      apiCount
    }
  }

  // Helper functions
  const getStoredActions = (type: string): OfflineAction[] => {
    const stored = localStorage.getItem(`offline-${type}`)
    return stored ? JSON.parse(stored) : []
  }

  const updatePendingActionsCount = (): void => {
    const actionTypes = ['room-action', 'media-progress', 'user-preferences']
    const total = actionTypes.reduce((count, type) => {
      return count + getStoredActions(type).length
    }, 0)
    setPendingActions(total)
  }

  const syncSingleAction = async (action: OfflineAction): Promise<void> => {
    const endpoints = {
      'room-action': '/api/rooms/sync',
      'media-progress': '/api/media/progress',
      'user-preferences': '/api/user/preferences'
    }

    const endpoint = endpoints[action.type]
    if (!endpoint) {
      throw new Error(`Unknown action type: ${action.type}`)
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action.data)
    })

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status}`)
    }
  }

  const handleServiceWorkerMessage = (data: any): void => {
    switch (data.type) {
      case 'CACHE_UPDATED':
        console.log('📦 Cache updated:', data.cacheName)
        break
      case 'SYNC_COMPLETE':
        console.log('✅ Background sync completed')
        updatePendingActionsCount()
        break
      case 'ERROR':
        console.error('❌ Service Worker error:', data.error)
        break
    }
  }

  const showUpdateNotification = (registration: ServiceWorkerRegistration): void => {
    // Show user notification about available update
    const update = confirm('A new version is available. Refresh to update?')
    if (update) {
      const newWorker = registration.waiting
      if (newWorker) {
        newWorker.postMessage({ type: 'SKIP_WAITING' })
        window.location.reload()
      }
    }
  }

  const isMediaURL = (url: string): boolean => {
    return url.includes('/plex/') && 
           (url.includes('/photo/') || url.includes('/video/') || url.includes('/media/'))
  }

  const isAPIURL = (url: string): boolean => {
    return url.includes('/api/')
  }

  return {
    isOnline,
    isServiceWorkerSupported,
    isServiceWorkerRegistered,
    pendingActions,
    registerServiceWorker,
    queueAction,
    syncPendingActions,
    clearCache,
    getCacheInfo
  }
}

// Higher-order component to provide offline functionality
export function withOfflineSupport<P extends object>(
  WrappedComponent: React.ComponentType<P & { offlineManager: OfflineManager }>
) {
  return function OfflineEnabledComponent(props: P) {
    const offlineManager = useOfflineManager()

    return React.createElement(WrappedComponent, { ...props, offlineManager })
  }
}

// Utility functions for offline actions
export const OfflineUtils = {
  // Queue room actions for offline sync
  queueRoomAction: (action: any) => {
    const offlineAction: OfflineAction = {
      id: `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'room-action',
      data: action,
      timestamp: Date.now()
    }

    const existing = JSON.parse(localStorage.getItem('offline-room-action') || '[]')
    localStorage.setItem('offline-room-action', JSON.stringify([...existing, offlineAction]))
  },

  // Queue media progress for offline sync
  queueMediaProgress: (progress: any) => {
    const offlineAction: OfflineAction = {
      id: `progress-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'media-progress',
      data: progress,
      timestamp: Date.now()
    }

    const existing = JSON.parse(localStorage.getItem('offline-media-progress') || '[]')
    localStorage.setItem('offline-media-progress', JSON.stringify([...existing, offlineAction]))
  },

  // Check if action should be queued (offline or failed request)
  shouldQueue: (error: any): boolean => {
    return !navigator.onLine || 
           (error && (error.name === 'NetworkError' || error.message.includes('fetch')))
  },

  // Get cached data with fallback
  getCachedOrFallback: async <T>(key: string, fallback: T): Promise<T> => {
    try {
      const cached = localStorage.getItem(`cache-${key}`)
      return cached ? JSON.parse(cached) : fallback
    } catch {
      return fallback
    }
  }
}