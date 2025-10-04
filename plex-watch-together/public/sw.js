// Service Worker for Plex Watch Together
// Provides offline functionality, caching, and background sync

const CACHE_NAME = 'plex-watch-together-v1'
const OFFLINE_URL = '/offline'
const FALLBACK_IMAGE = '/placeholder-media.jpg'

// Assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/offline',
  '/globals.css',
  '/placeholder-media.jpg',
  '/manifest.json'
]

// API routes that should be cached
const CACHEABLE_APIS = [
  '/api/rooms',
  '/api/plex/libraries',
  '/api/plex/setup'
]

// Media content cache (separate from static assets)
const MEDIA_CACHE_NAME = 'plex-media-cache-v1'
const MAX_MEDIA_CACHE_SIZE = 200 * 1024 * 1024 // 200MB
const MAX_CACHE_AGE = 24 * 60 * 60 * 1000 // 24 hours

// Background sync tasks
const SYNC_TAGS = {
  ROOM_ACTIONS: 'room-actions-sync',
  MEDIA_PROGRESS: 'media-progress-sync',
  USER_PREFERENCES: 'user-preferences-sync'
}

self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker installing...')
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Caching static assets')
        return cache.addAll(STATIC_ASSETS)
      })
      .then(() => {
        console.log('✅ Service Worker installation complete')
        return self.skipWaiting()
      })
      .catch((error) => {
        console.error('❌ Service Worker installation failed:', error)
      })
  )
})

self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker activating...')
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== MEDIA_CACHE_NAME) {
              console.log('🗑️ Deleting old cache:', cacheName)
              return caches.delete(cacheName)
            }
          })
        )
      })
      .then(() => {
        console.log('✅ Service Worker activated')
        return self.clients.claim()
      })
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return
  }

  // Handle different types of requests
  if (isMediaRequest(request)) {
    event.respondWith(handleMediaRequest(request))
  } else if (isAPIRequest(request)) {
    event.respondWith(handleAPIRequest(request))
  } else if (isNavigationRequest(request)) {
    event.respondWith(handleNavigationRequest(request))
  } else if (isStaticAssetRequest(request)) {
    event.respondWith(handleStaticAssetRequest(request))
  }
})

// Handle media requests (videos, thumbnails, etc.)
async function handleMediaRequest(request) {
  const cache = await caches.open(MEDIA_CACHE_NAME)
  
  try {
    // Try cache first for media
    const cachedResponse = await cache.match(request)
    if (cachedResponse) {
      console.log('📱 Serving media from cache:', request.url)
      return cachedResponse
    }

    // Fetch from network
    const response = await fetch(request)
    
    if (response.ok) {
      // Cache successful media responses
      const responseClone = response.clone()
      
      // Check cache size before adding
      const cacheSize = await getCacheSize(MEDIA_CACHE_NAME)
      if (cacheSize < MAX_MEDIA_CACHE_SIZE) {
        cache.put(request, responseClone)
      } else {
        // Clean old entries if cache is full
        await cleanOldCacheEntries(MEDIA_CACHE_NAME)
        cache.put(request, responseClone.clone())
      }
    }

    return response
  } catch (error) {
    console.error('❌ Media request failed:', error)
    
    // Return fallback image for failed media requests
    const cache = await caches.open(CACHE_NAME)
    const fallback = await cache.match(FALLBACK_IMAGE)
    return fallback || new Response('Media unavailable', { status: 404 })
  }
}

// Handle API requests with caching strategy
async function handleAPIRequest(request) {
  const url = new URL(request.url)
  
  // Check if this API should be cached
  const shouldCache = CACHEABLE_APIS.some(api => url.pathname.startsWith(api))
  
  if (!shouldCache) {
    // Just fetch without caching
    return fetch(request).catch(() => {
      return new Response(
        JSON.stringify({ error: 'Service unavailable', offline: true }),
        { 
          status: 503, 
          headers: { 'Content-Type': 'application/json' } 
        }
      )
    })
  }

  const cache = await caches.open(CACHE_NAME)
  
  try {
    // Try network first for API requests (network-first strategy)
    const response = await fetch(request)
    
    if (response.ok) {
      // Cache successful API responses
      const responseClone = response.clone()
      cache.put(request, responseClone)
    }
    
    return response
  } catch (error) {
    console.log('📱 Network failed, trying cache for:', request.url)
    
    // Fallback to cache
    const cachedResponse = await cache.match(request)
    if (cachedResponse) {
      // Add offline indicator to cached responses
      const cachedData = await cachedResponse.json()
      const offlineResponse = {
        ...cachedData,
        _offline: true,
        _cachedAt: new Date().toISOString()
      }
      
      return new Response(JSON.stringify(offlineResponse), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // No cache available
    return new Response(
      JSON.stringify({ 
        error: 'Service unavailable', 
        offline: true,
        message: 'No cached data available'
      }),
      { 
        status: 503, 
        headers: { 'Content-Type': 'application/json' } 
      }
    )
  }
}

// Handle navigation requests (page loads)
async function handleNavigationRequest(request) {
  const cache = await caches.open(CACHE_NAME)
  
  try {
    // Try network first
    const response = await fetch(request)
    return response
  } catch (error) {
    console.log('📱 Navigation offline, serving cached page')
    
    // Try to serve cached page
    const cachedResponse = await cache.match(request.url)
    if (cachedResponse) {
      return cachedResponse
    }

    // Try to serve root page
    const rootPage = await cache.match('/')
    if (rootPage) {
      return rootPage
    }

    // Serve offline page as last resort
    const offlinePage = await cache.match(OFFLINE_URL)
    return offlinePage || new Response('Offline', { status: 503 })
  }
}

// Handle static asset requests
async function handleStaticAssetRequest(request) {
  const cache = await caches.open(CACHE_NAME)
  
  // Try cache first for static assets (cache-first strategy)
  const cachedResponse = await cache.match(request)
  if (cachedResponse) {
    return cachedResponse
  }

  try {
    // Fetch from network and cache
    const response = await fetch(request)
    if (response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    console.error('❌ Static asset request failed:', error)
    return new Response('Asset unavailable', { status: 404 })
  }
}

// Background Sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('🔄 Background sync triggered:', event.tag)
  
  switch (event.tag) {
    case SYNC_TAGS.ROOM_ACTIONS:
      event.waitUntil(syncRoomActions())
      break
    case SYNC_TAGS.MEDIA_PROGRESS:
      event.waitUntil(syncMediaProgress())
      break
    case SYNC_TAGS.USER_PREFERENCES:
      event.waitUntil(syncUserPreferences())
      break
  }
})

// Sync functions for different data types
async function syncRoomActions() {
  console.log('🔄 Syncing room actions...')
  
  try {
    const storedActions = await getStoredData('pendingRoomActions')
    if (!storedActions || storedActions.length === 0) {
      return
    }

    const successful = []
    const failed = []

    for (const action of storedActions) {
      try {
        const response = await fetch('/api/rooms/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action)
        })

        if (response.ok) {
          successful.push(action.id)
        } else {
          failed.push(action)
        }
      } catch (error) {
        failed.push(action)
      }
    }

    // Update stored actions (remove successful ones)
    if (successful.length > 0) {
      const remainingActions = storedActions.filter(
        action => !successful.includes(action.id)
      )
      await storeData('pendingRoomActions', remainingActions)
    }

    console.log(`✅ Synced ${successful.length} room actions, ${failed.length} failed`)
  } catch (error) {
    console.error('❌ Room actions sync failed:', error)
  }
}

async function syncMediaProgress() {
  console.log('🔄 Syncing media progress...')
  
  try {
    const progress = await getStoredData('pendingMediaProgress')
    if (!progress || progress.length === 0) {
      return
    }

    for (const item of progress) {
      try {
        await fetch('/api/media/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item)
        })
      } catch (error) {
        console.error('Failed to sync progress item:', error)
      }
    }

    // Clear synced progress
    await clearStoredData('pendingMediaProgress')
    console.log('✅ Media progress synced')
  } catch (error) {
    console.error('❌ Media progress sync failed:', error)
  }
}

async function syncUserPreferences() {
  console.log('🔄 Syncing user preferences...')
  
  try {
    const preferences = await getStoredData('pendingUserPreferences')
    if (!preferences) {
      return
    }

    await fetch('/api/user/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preferences)
    })

    await clearStoredData('pendingUserPreferences')
    console.log('✅ User preferences synced')
  } catch (error) {
    console.error('❌ User preferences sync failed:', error)
  }
}

// Utility functions
function isMediaRequest(request) {
  const url = new URL(request.url)
  return url.pathname.includes('/plex/') && 
         (url.pathname.includes('/photo/') || 
          url.pathname.includes('/video/') || 
          url.pathname.includes('/media/'))
}

function isAPIRequest(request) {
  const url = new URL(request.url)
  return url.pathname.startsWith('/api/')
}

function isNavigationRequest(request) {
  return request.mode === 'navigate'
}

function isStaticAssetRequest(request) {
  const url = new URL(request.url)
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2)$/.test(url.pathname)
}

async function getCacheSize(cacheName) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  let size = 0
  
  for (const key of keys) {
    const response = await cache.match(key)
    if (response) {
      size += parseInt(response.headers.get('content-length') || '0')
    }
  }
  
  return size
}

async function cleanOldCacheEntries(cacheName) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  
  // Sort by date and remove oldest 25%
  const entriesToRemove = keys.slice(0, Math.floor(keys.length * 0.25))
  
  for (const key of entriesToRemove) {
    await cache.delete(key)
  }
  
  console.log(`🧹 Cleaned ${entriesToRemove.length} old cache entries`)
}

// IndexedDB utilities for storing offline data
async function storeData(key, data) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('PlexWatchTogether', 1)
    
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(['offlineData'], 'readwrite')
      const store = transaction.objectStore('offlineData')
      
      store.put({ key, data, timestamp: Date.now() })
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    }
    
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('offlineData')) {
        db.createObjectStore('offlineData', { keyPath: 'key' })
      }
    }
  })
}

async function getStoredData(key) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('PlexWatchTogether', 1)
    
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(['offlineData'], 'readonly')
      const store = transaction.objectStore('offlineData')
      const getRequest = store.get(key)
      
      getRequest.onsuccess = () => {
        const result = getRequest.result
        resolve(result ? result.data : null)
      }
      getRequest.onerror = () => reject(getRequest.error)
    }
  })
}

async function clearStoredData(key) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('PlexWatchTogether', 1)
    
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(['offlineData'], 'readwrite')
      const store = transaction.objectStore('offlineData')
      
      store.delete(key)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    }
  })
}

// Notify clients about online/offline status changes
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME })
  }
})

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(performBackgroundSync())
  }
})

async function performBackgroundSync() {
  console.log('🔄 Performing periodic background sync...')
  
  try {
    await Promise.all([
      syncRoomActions(),
      syncMediaProgress(),
      syncUserPreferences()
    ])
    
    console.log('✅ Background sync completed')
  } catch (error) {
    console.error('❌ Background sync failed:', error)
  }
}

console.log('🚀 Plex Watch Together Service Worker loaded')