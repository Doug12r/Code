// Injected script that runs in the page context for WebRTC access
// This file is injected by the content script

// Simple module loader for browser extension context
const loadModule = async (src) => {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.type = 'module'
    script.textContent = `
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome
      import('${browserAPI.runtime.getURL(src)}').then(module => {
        window.PlexWatchTogetherModules = window.PlexWatchTogetherModules || {}
        window.PlexWatchTogetherModules.WebRTCManager = module.WebRTCManager
        window.dispatchEvent(new CustomEvent('moduleLoaded', { detail: 'WebRTCManager' }))
      }).catch(error => {
        console.error('Failed to load module:', error)
        window.dispatchEvent(new CustomEvent('moduleError', { detail: error }))
      })
    `
    
    document.head.appendChild(script)
    
    const handleLoad = (event) => {
      if (event.detail === 'WebRTCManager') {
        window.removeEventListener('moduleLoaded', handleLoad)
        window.removeEventListener('moduleError', handleError)
        resolve(window.PlexWatchTogetherModules.WebRTCManager)
      }
    }
    
    const handleError = (event) => {
      window.removeEventListener('moduleLoaded', handleLoad)
      window.removeEventListener('moduleError', handleError)
      reject(event.detail)
    }
    
    window.addEventListener('moduleLoaded', handleLoad)
    window.addEventListener('moduleError', handleError)
  })
}

// Initialize the main application
const initPlexWatchTogether = async () => {
  try {
    // For now, we'll define WebRTCManager inline to avoid import issues
    class WebRTCManager {
      constructor(userId, userName) {
        this.userId = userId
        this.userName = userName
        this.room = null
        this.eventListeners = new Map()
        this.signalingChannel = null
        this.iceServers = [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
        
        this.setupSignalingChannel()
      }

      setupSignalingChannel() {
        // Use BroadcastChannel for same-origin signaling (fallback)
        this.signalingChannel = new BroadcastChannel('plex-watch-together-signaling')
        this.signalingChannel.onmessage = (event) => {
          this.handleSignalingMessage(event.data)
        }
      }

      // Create a new room as host
      async createRoom() {
        const roomId = this.generateRoomId()
        
        this.room = {
          id: roomId,
          hostId: this.userId,
          peers: new Map(),
          syncState: {
            position: 0,
            timestamp: Date.now(),
            isPlaying: false,
            playbackRate: 1,
            syncVersion: 0
          },
          createdAt: Date.now()
        }

        console.log('Created room:', roomId)
        return roomId
      }

      // Simplified methods for initial testing
      async joinRoom(roomId, offer = null) {
        console.log('Joining room:', roomId)
        // TODO: Implement full WebRTC connection
        return true
      }

      sendPlay(position, timestamp) {
        console.log('Sending play event:', { position, timestamp })
      }

      sendPause(position, timestamp) {
        console.log('Sending pause event:', { position, timestamp })
      }

      sendSeek(position, timestamp) {
        console.log('Sending seek event:', { position, timestamp })
      }

      updateSyncState(syncState) {
        if (this.room) {
          this.room.syncState = { ...this.room.syncState, ...syncState }
        }
      }

      on(event, callback) {
        if (!this.eventListeners.has(event)) {
          this.eventListeners.set(event, [])
        }
        this.eventListeners.get(event).push(callback)
      }

      off(event, callback) {
        const listeners = this.eventListeners.get(event)
        if (listeners) {
          const index = listeners.indexOf(callback)
          if (index > -1) {
            listeners.splice(index, 1)
          }
        }
      }

      emit(event, data) {
        const listeners = this.eventListeners.get(event)
        if (listeners) {
          listeners.forEach(callback => callback(data))
        }
      }

      generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase()
      }

      isHost() {
        return this.room?.hostId === this.userId
      }

      getCurrentRoom() {
        return this.room
      }

      getConnectedPeers() {
        if (!this.room) return []
        return Array.from(this.room.peers.values()).filter(peer => peer.connected)
      }

      leaveRoom() {
        if (this.room) {
          this.room = null
          console.log('Left room')
        }
      }

      destroy() {
        this.leaveRoom()
        if (this.signalingChannel) {
          this.signalingChannel.close()
          this.signalingChannel = null
        }
        this.eventListeners.clear()
      }

      // Placeholder methods
      handleSignalingMessage(message) {
        console.log('Signaling message:', message)
      }
    }

    // Make WebRTCManager available globally
    window.PlexWatchTogetherWebRTC = WebRTCManager

    // Dispatch event to let content script know we're ready
    window.dispatchEvent(new CustomEvent('plexWatchTogetherReady'))
    
  } catch (error) {
    console.error('Failed to initialize Plex Watch Together:', error)
  }
}

// Initialize when script loads
initPlexWatchTogether()