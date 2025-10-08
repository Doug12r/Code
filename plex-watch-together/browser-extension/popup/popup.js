// Popup script for Plex Watch Together extension

class PopupManager {
  constructor() {
    this.browserAPI = typeof browser !== 'undefined' ? browser : chrome
    this.currentTab = null
    this.isConnected = false
    this.currentRoom = null
    this.isHost = false
    
    this.init()
  }

  async init() {
    console.log('Popup: Initializing...')
    
    // Get current tab
    await this.getCurrentTab()
    
    // Set up UI event listeners
    this.setupEventListeners()
    
    // Check if we're on Plex and get status
    await this.checkPlexStatus()
    
    // Load saved settings
    await this.loadSettings()
    
    console.log('Popup: Initialized')
  }

  async getCurrentTab() {
    const tabs = await this.browserAPI.tabs.query({ active: true, currentWindow: true })
    this.currentTab = tabs[0]
  }

  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab)
      })
    })

    // Create room
    document.getElementById('create-room-btn').addEventListener('click', () => {
      this.createRoom()
    })

    // Join room
    document.getElementById('join-room-btn').addEventListener('click', () => {
      this.joinRoom()
    })

    // Leave room
    document.getElementById('leave-room-btn').addEventListener('click', () => {
      this.leaveRoom()
    })

    // Scan QR code
    document.getElementById('scan-qr-btn').addEventListener('click', () => {
      this.scanQRCode()
    })

    // Room ID click to copy
    document.getElementById('room-id-display').addEventListener('click', () => {
      this.copyRoomId()
    })

    // Name input changes
    document.getElementById('user-name').addEventListener('change', (e) => {
      this.saveUserName(e.target.value)
    })
    
    document.getElementById('join-user-name').addEventListener('change', (e) => {
      this.saveUserName(e.target.value)
    })

    // Enter key handling
    document.getElementById('room-id-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.joinRoom()
      }
    })
  }

  async checkPlexStatus() {
    const loadingEl = document.getElementById('loading')
    const noPlexEl = document.getElementById('no-plex-warning')
    const mainContentEl = document.getElementById('main-content')

    try {
      // Check if current tab is Plex
      if (!this.currentTab?.url?.includes('app.plex.tv')) {
        loadingEl.classList.add('hidden')
        noPlexEl.classList.remove('hidden')
        return
      }

      // Try to get status from content script
      const response = await this.browserAPI.tabs.sendMessage(this.currentTab.id, {
        action: 'getStatus'
      })

      if (response) {
        this.updateUI(response)
        loadingEl.classList.add('hidden')
        mainContentEl.classList.remove('hidden')
      } else {
        throw new Error('No response from content script')
      }
    } catch (error) {
      console.error('Failed to get Plex status:', error)
      loadingEl.classList.add('hidden')
      noPlexEl.classList.remove('hidden')
    }
  }

  async loadSettings() {
    try {
      const result = await this.browserAPI.storage.local.get(['userName'])
      const userName = result.userName || ''
      
      document.getElementById('user-name').value = userName
      document.getElementById('join-user-name').value = userName
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  async saveUserName(name) {
    try {
      await this.browserAPI.storage.local.set({ userName: name })
      
      // Sync both input fields
      document.getElementById('user-name').value = name
      document.getElementById('join-user-name').value = name
    } catch (error) {
      console.error('Failed to save user name:', error)
    }
  }

  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
      btn.classList.remove('active')
    })
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active')

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active')
    })
    document.getElementById(`${tabName}-tab`).classList.add('active')
  }

  async createRoom() {
    const userNameEl = document.getElementById('user-name')
    const createBtnEl = document.getElementById('create-room-btn')
    
    const userName = userNameEl.value.trim()
    if (!userName) {
      alert('Please enter your name first')
      userNameEl.focus()
      return
    }

    createBtnEl.disabled = true
    createBtnEl.textContent = 'Creating...'

    try {
      // Send message to content script to create room
      const response = await this.browserAPI.tabs.sendMessage(this.currentTab.id, {
        action: 'createRoom',
        userName
      })

      if (response?.success) {
        // Room created successfully
        await this.refreshStatus()
        this.showRoomCreated(response.roomId)
      } else {
        throw new Error(response?.error || 'Failed to create room')
      }
    } catch (error) {
      console.error('Failed to create room:', error)
      alert('Failed to create room. Please make sure you\'re on a Plex video page.')
    } finally {
      createBtnEl.disabled = false
      createBtnEl.textContent = '🎯 Create Watch Party'
    }
  }

  async joinRoom() {
    const userNameEl = document.getElementById('join-user-name')
    const roomIdEl = document.getElementById('room-id-input')
    const joinBtnEl = document.getElementById('join-room-btn')
    
    const userName = userNameEl.value.trim()
    const roomId = roomIdEl.value.trim().toUpperCase()
    
    if (!userName) {
      alert('Please enter your name first')
      userNameEl.focus()
      return
    }
    
    if (!roomId) {
      alert('Please enter a room ID')
      roomIdEl.focus()
      return
    }

    joinBtnEl.disabled = true
    joinBtnEl.textContent = 'Joining...'

    try {
      // Send message to content script to join room
      const response = await this.browserAPI.tabs.sendMessage(this.currentTab.id, {
        action: 'joinRoom',
        roomId,
        userName
      })

      if (response?.success) {
        // Room joined successfully
        await this.refreshStatus()
        roomIdEl.value = ''
      } else {
        throw new Error(response?.error || 'Failed to join room')
      }
    } catch (error) {
      console.error('Failed to join room:', error)
      alert('Failed to join room. Please check the room ID and try again.')
    } finally {
      joinBtnEl.disabled = false
      joinBtnEl.textContent = '🚀 Join Watch Party'
    }
  }

  async leaveRoom() {
    const leaveBtnEl = document.getElementById('leave-room-btn')
    
    leaveBtnEl.disabled = true
    leaveBtnEl.textContent = 'Leaving...'

    try {
      // Send message to content script to leave room
      await this.browserAPI.tabs.sendMessage(this.currentTab.id, {
        action: 'leaveRoom'
      })

      // Refresh status
      await this.refreshStatus()
      this.hideRoomInfo()
    } catch (error) {
      console.error('Failed to leave room:', error)
    } finally {
      leaveBtnEl.disabled = false
      leaveBtnEl.textContent = '🚪 Leave Room'
    }
  }

  async scanQRCode() {
    // TODO: Implement QR code scanning
    // For now, show an alert
    alert('QR code scanning will be implemented in the next version. Please enter the room ID manually for now.')
  }

  async copyRoomId() {
    const roomIdEl = document.getElementById('room-id-display')
    const roomId = roomIdEl.textContent
    
    try {
      await navigator.clipboard.writeText(roomId)
      
      // Visual feedback
      const originalText = roomIdEl.textContent
      roomIdEl.textContent = 'Copied! ✓'
      roomIdEl.style.color = '#4caf50'
      
      setTimeout(() => {
        roomIdEl.textContent = originalText
        roomIdEl.style.color = ''
      }, 1000)
    } catch (error) {
      console.error('Failed to copy room ID:', error)
      // Fallback selection
      const range = document.createRange()
      range.selectNodeContents(roomIdEl)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }

  async refreshStatus() {
    try {
      const response = await this.browserAPI.tabs.sendMessage(this.currentTab.id, {
        action: 'getStatus'
      })
      
      if (response) {
        this.updateUI(response)
      }
    } catch (error) {
      console.error('Failed to refresh status:', error)
    }
  }

  updateUI(status) {
    const statusEl = document.getElementById('status')
    const roomInfoEl = document.getElementById('room-info-section')
    
    this.isConnected = !!status.room
    this.currentRoom = status.room
    this.isHost = status.isHost

    // Update connection status
    if (this.isConnected) {
      statusEl.className = 'status connected'
      statusEl.innerHTML = `
        <div class="status-icon">🟢</div>
        <div class="status-text">Connected to room</div>
      `
      this.showRoomInfo()
    } else {
      statusEl.className = 'status'
      statusEl.innerHTML = `
        <div class="status-icon">🔴</div>
        <div class="status-text">Not connected</div>
      `
      this.hideRoomInfo()
    }

    // Update room information
    if (this.currentRoom) {
      document.getElementById('current-room-id').textContent = this.currentRoom.id
      document.getElementById('user-role').textContent = this.isHost ? 'Host' : 'Participant'
      
      const peerCount = this.currentRoom.peers ? Array.from(this.currentRoom.peers.values()).filter(p => p.connected).length : 0
      document.getElementById('participant-count').textContent = peerCount + 1 // +1 for self
      
      // Update participants list
      this.updateParticipantsList()
    }
  }

  showRoomCreated(roomId) {
    document.getElementById('room-id-display').textContent = roomId
    document.getElementById('room-created').classList.remove('hidden')
    
    // Generate QR code
    this.generateQRCode(roomId)
  }

  showRoomInfo() {
    document.getElementById('room-info-section').classList.remove('hidden')
  }

  hideRoomInfo() {
    document.getElementById('room-info-section').classList.add('hidden')
    document.getElementById('room-created').classList.add('hidden')
  }

  updateParticipantsList() {
    const containerEl = document.getElementById('participants-container')
    const listEl = document.getElementById('participants-list')
    
    if (!this.currentRoom?.peers) {
      listEl.classList.add('hidden')
      return
    }

    const peers = Array.from(this.currentRoom.peers.values()).filter(p => p.connected)
    
    if (peers.length === 0) {
      listEl.classList.add('hidden')
      return
    }

    // Show participants list
    listEl.classList.remove('hidden')
    
    // Clear existing participants
    containerEl.innerHTML = ''
    
    // Add self
    const selfEl = document.createElement('div')
    selfEl.className = 'participant'
    selfEl.innerHTML = `
      <div class="participant-icon"></div>
      <div class="participant-name">You</div>
      <div class="participant-role">${this.isHost ? 'Host' : 'Participant'}</div>
    `
    containerEl.appendChild(selfEl)
    
    // Add peers
    peers.forEach(peer => {
      const peerEl = document.createElement('div')
      peerEl.className = 'participant'
      peerEl.innerHTML = `
        <div class="participant-icon"></div>
        <div class="participant-name">${peer.userName}</div>
        <div class="participant-role">${peer.isHost ? 'Host' : 'Participant'}</div>
      `
      containerEl.appendChild(peerEl)
    })
  }

  generateQRCode(roomId) {
    // TODO: Implement actual QR code generation
    // For now, just show placeholder
    const canvas = document.getElementById('qr-code')
    const ctx = canvas.getContext('2d')
    
    // Clear canvas
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 200, 200)
    
    // Draw placeholder pattern
    ctx.fillStyle = '#000000'
    for (let i = 0; i < 20; i++) {
      for (let j = 0; j < 20; j++) {
        if (Math.random() > 0.5) {
          ctx.fillRect(i * 10, j * 10, 10, 10)
        }
      }
    }
    
    // Add text overlay
    ctx.fillStyle = '#e5a00d'
    ctx.fillRect(50, 85, 100, 30)
    ctx.fillStyle = '#000000'
    ctx.font = '12px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(roomId, 100, 105)
    
    console.log('QR code generated for room:', roomId)
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager()
})