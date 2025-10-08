// Content script that injects into Plex web interface
// This runs in the context of app.plex.tv pages

class PlexWatchTogether {
  constructor() {
    this.videoElement = null
    this.webrtcManager = null
    this.userId = this.generateUserId()
    this.userName = 'User' // Will be set from storage
    this.isHost = false
    this.syncTolerance = 1000 // 1 second tolerance for sync
    this.lastSyncTime = 0
    this.isInitialized = false
    this.WebRTCManager = null // Will be loaded from injected script
    
    // Sync state tracking
    this.lastKnownPosition = 0
    this.lastKnownIsPlaying = false
    this.ignoreNextEvent = false

    this.init()
  }

  async init() {
    console.log('Plex Watch Together: Initializing...')
    
    // Inject the WebRTC script first
    await this.injectScript()
    
    // Load user settings
    await this.loadSettings()
    
    // Find and monitor video element
    this.findVideoElement()
    
    // Set up UI
    this.createUI()
    
    // Set up message passing with popup
    this.setupMessagePassing()
    
    console.log('Plex Watch Together: Initialized')
    this.isInitialized = true
  }

  async injectScript() {
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    
    return new Promise((resolve) => {
      // Inject the WebRTC script into the page context
      const script = document.createElement('script')
      script.src = browserAPI.runtime.getURL('src/injected.js')
      script.onload = () => {
        script.remove()
      }
      document.documentElement.appendChild(script)

      // Wait for the injected script to be ready
      const handleReady = () => {
        if (window.PlexWatchTogetherWebRTC) {
          this.WebRTCManager = window.PlexWatchTogetherWebRTC
          window.removeEventListener('plexWatchTogetherReady', handleReady)
          resolve()
        }
      }

      window.addEventListener('plexWatchTogetherReady', handleReady)
      
      // Fallback timeout
      setTimeout(() => {
        if (!this.WebRTCManager) {
          console.warn('WebRTC Manager not loaded, using fallback')
          this.WebRTCManager = class FallbackWebRTCManager {
            constructor() { this.room = null }
            async createRoom() { return 'FALLBACK' }
            async joinRoom() { return true }
            isHost() { return false }
            getCurrentRoom() { return null }
            getConnectedPeers() { return [] }
            leaveRoom() {}
            destroy() {}
            on() {}
            off() {}
            sendPlay() {}
            sendPause() {}
            sendSeek() {}
            updateSyncState() {}
          }
        }
        resolve()
      }, 2000)
    })
  }

  async loadSettings() {
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    
    try {
      const result = await browserAPI.storage.local.get(['userName', 'settings'])
      this.userName = result.userName || `User${Math.floor(Math.random() * 1000)}`
      
      const settings = result.settings || {}
      this.syncTolerance = settings.syncTolerance || 1000
      
      // Save default settings if not exists
      await browserAPI.storage.local.set({
        userName: this.userName,
        settings: {
          autoSync: true,
          syncTolerance: this.syncTolerance,
          showNotifications: true,
          ...settings
        }
      })
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  findVideoElement() {
    // Plex video player detection
    const checkForVideo = () => {
      // Try multiple selectors for Plex video player
      const selectors = [
        'video[data-testid="media-player-video"]',
        'video[class*="video"]',
        'div[data-testid="video-player"] video',
        '.video-player video',
        'video'
      ]
      
      for (const selector of selectors) {
        const video = document.querySelector(selector)
        if (video && video !== this.videoElement) {
          this.onVideoFound(video)
          return
        }
      }
    }

    // Initial check
    checkForVideo()

    // Set up observer for dynamic content
    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          shouldCheck = true
        }
      })
      if (shouldCheck) {
        checkForVideo()
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true
    })

    // Periodic check as fallback
    setInterval(checkForVideo, 2000)
  }

  onVideoFound(video) {
    if (this.videoElement === video) return

    console.log('Plex Watch Together: Video player found')
    this.videoElement = video
    this.attachVideoListeners()
    this.updateUI()
  }

  attachVideoListeners() {
    if (!this.videoElement) return

    // Remove existing listeners
    this.removeVideoListeners()

    const events = {
      'play': this.onVideoPlay.bind(this),
      'pause': this.onVideoPause.bind(this),
      'seeked': this.onVideoSeeked.bind(this),
      'timeupdate': this.onVideoTimeUpdate.bind(this),
      'loadstart': this.onVideoLoadStart.bind(this),
      'loadedmetadata': this.onVideoLoadedMetadata.bind(this)
    }

    Object.entries(events).forEach(([event, handler]) => {
      this.videoElement.addEventListener(event, handler)
    })

    console.log('Plex Watch Together: Video listeners attached')
  }

  removeVideoListeners() {
    if (!this.videoElement) return

    const events = ['play', 'pause', 'seeked', 'timeupdate', 'loadstart', 'loadedmetadata']
    events.forEach(event => {
      this.videoElement.removeEventListener(event, this[`onVideo${event.charAt(0).toUpperCase() + event.slice(1)}`])
    })
  }

  onVideoPlay(event) {
    if (this.ignoreNextEvent) {
      this.ignoreNextEvent = false
      return
    }

    console.log('Video play event')
    const position = this.videoElement.currentTime
    const timestamp = Date.now()

    this.lastKnownPosition = position
    this.lastKnownIsPlaying = true

    if (this.webrtcManager && this.webrtcManager.isHost()) {
      this.webrtcManager.sendPlay(position, timestamp)
      this.webrtcManager.updateSyncState({
        position,
        timestamp,
        isPlaying: true,
        syncVersion: this.webrtcManager.getCurrentRoom()?.syncState?.syncVersion + 1 || 1
      })
    }
  }

  onVideoPause(event) {
    if (this.ignoreNextEvent) {
      this.ignoreNextEvent = false
      return
    }

    console.log('Video pause event')
    const position = this.videoElement.currentTime
    const timestamp = Date.now()

    this.lastKnownPosition = position
    this.lastKnownIsPlaying = false

    if (this.webrtcManager && this.webrtcManager.isHost()) {
      this.webrtcManager.sendPause(position, timestamp)
      this.webrtcManager.updateSyncState({
        position,
        timestamp,
        isPlaying: false,
        syncVersion: this.webrtcManager.getCurrentRoom()?.syncState?.syncVersion + 1 || 1
      })
    }
  }

  onVideoSeeked(event) {
    if (this.ignoreNextEvent) {
      this.ignoreNextEvent = false
      return
    }

    console.log('Video seek event')
    const position = this.videoElement.currentTime
    const timestamp = Date.now()

    this.lastKnownPosition = position

    if (this.webrtcManager && this.webrtcManager.isHost()) {
      this.webrtcManager.sendSeek(position, timestamp)
      this.webrtcManager.updateSyncState({
        position,
        timestamp,
        syncVersion: this.webrtcManager.getCurrentRoom()?.syncState?.syncVersion + 1 || 1
      })
    }
  }

  onVideoTimeUpdate(event) {
    // Throttled sync check for drift correction
    const now = Date.now()
    if (now - this.lastSyncTime > 5000) { // Check every 5 seconds
      this.checkSyncDrift()
      this.lastSyncTime = now
    }
  }

  onVideoLoadStart(event) {
    console.log('Video load start')
    // Media is changing, notify peers if host
  }

  onVideoLoadedMetadata(event) {
    console.log('Video loaded metadata')
    // Get media info and update room state
    this.updateMediaInfo()
  }

  checkSyncDrift() {
    if (!this.webrtcManager || !this.videoElement) return

    const room = this.webrtcManager.getCurrentRoom()
    if (!room || this.webrtcManager.isHost()) return

    const currentPosition = this.videoElement.currentTime
    const expectedPosition = this.calculateExpectedPosition(room.syncState)
    const drift = Math.abs(currentPosition - expectedPosition)

    if (drift > this.syncTolerance / 1000) { // Convert ms to seconds
      console.log(`Sync drift detected: ${drift}s, correcting...`)
      this.correctSyncDrift(expectedPosition, room.syncState.isPlaying)
    }
  }

  calculateExpectedPosition(syncState) {
    if (!syncState.isPlaying) return syncState.position

    const timeSinceSync = (Date.now() - syncState.timestamp) / 1000
    return syncState.position + (timeSinceSync * syncState.playbackRate)
  }

  correctSyncDrift(targetPosition, shouldBePlaying) {
    this.ignoreNextEvent = true
    
    this.videoElement.currentTime = targetPosition
    
    if (shouldBePlaying && this.videoElement.paused) {
      this.videoElement.play()
    } else if (!shouldBePlaying && !this.videoElement.paused) {
      this.videoElement.pause()
    }
  }

  updateMediaInfo() {
    // Extract media info from Plex interface
    const mediaInfo = this.extractMediaInfo()
    if (mediaInfo && this.webrtcManager) {
      this.webrtcManager.updateSyncState({ mediaId: mediaInfo.id })
    }
  }

  extractMediaInfo() {
    // Try to extract media information from Plex UI
    const titleSelectors = [
      '[data-testid="metadata-title"]',
      '.metadata-title',
      'h1[class*="title"]'
    ]

    for (const selector of titleSelectors) {
      const titleElement = document.querySelector(selector)
      if (titleElement) {
        return {
          id: this.generateMediaId(),
          title: titleElement.textContent?.trim() || 'Unknown',
          duration: this.videoElement?.duration || 0
        }
      }
    }

    return null
  }

  createUI() {
    // Create floating UI button
    const button = document.createElement('div')
    button.id = 'plex-watch-together-button'
    button.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        width: 50px;
        height: 50px;
        background: #e5a00d;
        border-radius: 50%;
        cursor: pointer;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        font-size: 24px;
        color: white;
        user-select: none;
      " title="Plex Watch Together">
        👥
      </div>
    `

    button.addEventListener('click', () => {
      this.toggleUI()
    })

    document.body.appendChild(button)
    this.uiButton = button.firstElementChild

    // Create main UI panel
    this.createMainPanel()
  }

  createMainPanel() {
    const panel = document.createElement('div')
    panel.id = 'plex-watch-together-panel'
    panel.innerHTML = `
      <div style="
        position: fixed;
        top: 80px;
        right: 20px;
        width: 300px;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 20px;
        z-index: 10000;
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: none;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      ">
        <h3 style="margin: 0 0 15px 0; color: #e5a00d;">Watch Together</h3>
        
        <div id="connection-status" style="margin-bottom: 15px; padding: 8px; border-radius: 4px; background: #333;">
          <span>🔴 Not connected</span>
        </div>

        <div style="margin-bottom: 15px;">
          <input type="text" id="user-name" placeholder="Your name" style="
            width: 100%;
            padding: 8px;
            background: #333;
            border: 1px solid #555;
            border-radius: 4px;
            color: white;
            box-sizing: border-box;
          ">
        </div>

        <div style="margin-bottom: 15px;">
          <button id="create-room-btn" style="
            width: 100%;
            padding: 10px;
            background: #e5a00d;
            border: none;
            border-radius: 4px;
            color: white;
            cursor: pointer;
            margin-bottom: 10px;
          ">Create Room</button>
          
          <button id="join-room-btn" style="
            width: 100%;
            padding: 10px;
            background: #666;
            border: none;
            border-radius: 4px;
            color: white;
            cursor: pointer;
          ">Join Room</button>
        </div>

        <div id="room-info" style="display: none; margin-bottom: 15px;">
          <div>Room: <span id="room-id"></span></div>
          <div>Role: <span id="user-role"></span></div>
          <div>Peers: <span id="peer-count">0</span></div>
        </div>

        <div id="qr-container" style="display: none; text-align: center; margin-bottom: 15px;">
          <div>Share this QR code:</div>
          <canvas id="qr-code" width="200" height="200" style="border: 1px solid #333; margin: 10px 0;"></canvas>
        </div>

        <div style="margin-top: 15px;">
          <button id="leave-room-btn" style="
            width: 100%;
            padding: 8px;
            background: #d32f2f;
            border: none;
            border-radius: 4px;
            color: white;
            cursor: pointer;
            display: none;
          ">Leave Room</button>
        </div>
      </div>
    `

    document.body.appendChild(panel)
    this.uiPanel = panel.firstElementChild

    this.setupUIEvents()
  }

  setupUIEvents() {
    const userNameInput = document.getElementById('user-name')
    const createRoomBtn = document.getElementById('create-room-btn')
    const joinRoomBtn = document.getElementById('join-room-btn')
    const leaveRoomBtn = document.getElementById('leave-room-btn')

    userNameInput.value = this.userName
    userNameInput.addEventListener('change', (e) => {
      this.userName = e.target.value
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      browserAPI.storage.local.set({ userName: this.userName })
    })

    createRoomBtn.addEventListener('click', () => this.createRoom())
    joinRoomBtn.addEventListener('click', () => this.showJoinDialog())
    leaveRoomBtn.addEventListener('click', () => this.leaveRoom())
  }

  toggleUI() {
    const isVisible = this.uiPanel.style.display !== 'none'
    this.uiPanel.style.display = isVisible ? 'none' : 'block'
  }

  updateUI() {
    // Update connection status and room info
    const statusEl = document.getElementById('connection-status')
    const roomInfoEl = document.getElementById('room-info')
    const roomIdEl = document.getElementById('room-id')
    const userRoleEl = document.getElementById('user-role')
    const peerCountEl = document.getElementById('peer-count')
    const leaveBtn = document.getElementById('leave-room-btn')

    if (this.webrtcManager && this.webrtcManager.getCurrentRoom()) {
      const room = this.webrtcManager.getCurrentRoom()
      const peerCount = this.webrtcManager.getConnectedPeers().length

      statusEl.innerHTML = '🟢 Connected'
      statusEl.style.background = '#2e7d32'
      
      roomInfoEl.style.display = 'block'
      roomIdEl.textContent = room.id
      userRoleEl.textContent = this.webrtcManager.isHost() ? 'Host' : 'Participant'
      peerCountEl.textContent = peerCount
      leaveBtn.style.display = 'block'
    } else {
      statusEl.innerHTML = '🔴 Not connected'
      statusEl.style.background = '#333'
      roomInfoEl.style.display = 'none'
      leaveBtn.style.display = 'none'
    }
  }

  async createRoom() {
    if (!this.webrtcManager && this.WebRTCManager) {
      this.webrtcManager = new this.WebRTCManager(this.userId, this.userName)
      this.setupWebRTCEventListeners()
    }

    try {
      const roomId = await this.webrtcManager.createRoom()
      this.isHost = true
      console.log('Room created:', roomId)
      
      this.updateUI()
      this.generateQRCode(roomId)
      
    } catch (error) {
      console.error('Failed to create room:', error)
      alert('Failed to create room. Please try again.')
    }
  }

  showJoinDialog() {
    const roomId = prompt('Enter room ID or scan QR code:')
    if (roomId) {
      this.joinRoom(roomId)
    }
  }

  async joinRoom(roomId, offer = null) {
    if (!this.webrtcManager && this.WebRTCManager) {
      this.webrtcManager = new this.WebRTCManager(this.userId, this.userName)
      this.setupWebRTCEventListeners()
    }

    try {
      const success = await this.webrtcManager.joinRoom(roomId, offer)
      if (success) {
        this.isHost = false
        console.log('Joined room:', roomId)
        this.updateUI()
      } else {
        alert('Failed to join room. Please check the room ID.')
      }
    } catch (error) {
      console.error('Failed to join room:', error)
      alert('Failed to join room. Please try again.')
    }
  }

  leaveRoom() {
    if (this.webrtcManager) {
      this.webrtcManager.leaveRoom()
      this.webrtcManager = null
    }
    this.isHost = false
    this.updateUI()
    this.hideQRCode()
  }

  setupWebRTCEventListeners() {
    if (!this.webrtcManager) return

    this.webrtcManager.on('peer-joined', (data) => {
      console.log('Peer joined:', data.userName)
      this.updateUI()
    })

    this.webrtcManager.on('peer-left', (data) => {
      console.log('Peer left:', data.peerId)
      this.updateUI()
    })

    this.webrtcManager.on('play', (data) => {
      console.log('Received play command:', data)
      this.handleSyncPlay(data)
    })

    this.webrtcManager.on('pause', (data) => {
      console.log('Received pause command:', data)
      this.handleSyncPause(data)
    })

    this.webrtcManager.on('seek', (data) => {
      console.log('Received seek command:', data)
      this.handleSyncSeek(data)
    })

    this.webrtcManager.on('chat-message', (data) => {
      console.log('Chat message:', data)
      // TODO: Implement chat UI
    })
  }

  handleSyncPlay(data) {
    if (!this.videoElement || this.webrtcManager.isHost()) return

    this.ignoreNextEvent = true
    
    const networkDelay = Date.now() - data.timestamp
    const targetPosition = data.position + (networkDelay / 1000)
    
    this.videoElement.currentTime = targetPosition
    if (this.videoElement.paused) {
      this.videoElement.play()
    }
  }

  handleSyncPause(data) {
    if (!this.videoElement || this.webrtcManager.isHost()) return

    this.ignoreNextEvent = true
    
    this.videoElement.currentTime = data.position
    if (!this.videoElement.paused) {
      this.videoElement.pause()
    }
  }

  handleSyncSeek(data) {
    if (!this.videoElement || this.webrtcManager.isHost()) return

    this.ignoreNextEvent = true
    this.videoElement.currentTime = data.position
  }

  generateQRCode(roomId) {
    // TODO: Implement QR code generation
    // For now, show the room ID
    document.getElementById('qr-container').style.display = 'block'
    console.log('Room ID for QR code:', roomId)
  }

  hideQRCode() {
    document.getElementById('qr-container').style.display = 'none'
  }

  setupMessagePassing() {
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    
    // Listen for messages from popup/background
    browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'getStatus':
          sendResponse({
            isInitialized: this.isInitialized,
            hasVideo: !!this.videoElement,
            room: this.webrtcManager?.getCurrentRoom(),
            isHost: this.isHost
          })
          break
        
        case 'createRoom':
          this.createRoom()
          break
        
        case 'joinRoom':
          this.joinRoom(request.roomId, request.offer)
          break
        
        case 'leaveRoom':
          this.leaveRoom()
          break
      }
    })
  }

  generateUserId() {
    return 'user_' + Math.random().toString(36).substring(2, 15)
  }

  generateMediaId() {
    return 'media_' + Math.random().toString(36).substring(2, 15)
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new PlexWatchTogether()
  })
} else {
  new PlexWatchTogether()
}