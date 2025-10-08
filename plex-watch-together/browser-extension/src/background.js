// Background script for Plex Watch Together extension (Firefox compatible)

class BackgroundManager {
  constructor() {
    this.rooms = new Map() // Track active rooms
    this.connections = new Map() // Track WebRTC signaling
    
    this.setupMessageHandlers()
    this.setupStorageHandlers()
  }

  setupMessageHandlers() {
    // Handle messages from content scripts and popup
    // Use browser API for Firefox compatibility
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    
    browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'createRoom':
          this.handleCreateRoom(request, sender, sendResponse)
          break
        
        case 'joinRoom':
          this.handleJoinRoom(request, sender, sendResponse)
          break
        
        case 'leaveRoom':
          this.handleLeaveRoom(request, sender, sendResponse)
          break
        
        case 'getRooms':
          sendResponse({ rooms: Array.from(this.rooms.values()) })
          break
        
        case 'signaling':
          this.handleSignaling(request, sender, sendResponse)
          break
        
        case 'getConnectionAnswers':
          this.handleGetConnectionAnswers(request, sender, sendResponse)
          break
      }
      
      return true // Keep message channel open for async responses
    })
  }

  setupStorageHandlers() {
    // Clean up old connection answers periodically
    setInterval(() => {
      this.cleanupOldAnswers()
    }, 60000) // Every minute
  }

  async handleCreateRoom(request, sender, sendResponse) {
    const roomId = this.generateRoomId()
    const tabId = sender.tab?.id

    const room = {
      id: roomId,
      hostTabId: tabId,
      hostId: request.userId,
      hostName: request.userName,
      created: Date.now(),
      participants: new Map()
    }

    this.rooms.set(roomId, room)
    
    console.log('Background: Room created', roomId)
    sendResponse({ success: true, roomId })
  }

  async handleJoinRoom(request, sender, sendResponse) {
    const { roomId, userId, userName } = request
    const tabId = sender.tab?.id
    
    const room = this.rooms.get(roomId)
    if (!room) {
      sendResponse({ success: false, error: 'Room not found' })
      return
    }

    room.participants.set(userId, {
      userId,
      userName,
      tabId,
      joined: Date.now()
    })

    console.log('Background: User joined room', { roomId, userName })
    sendResponse({ success: true, room })
  }

  async handleLeaveRoom(request, sender, sendResponse) {
    const { roomId, userId } = request
    
    const room = this.rooms.get(roomId)
    if (room) {
      room.participants.delete(userId)
      
      // If room is empty or host left, remove room
      if (room.participants.size === 0 || room.hostId === userId) {
        this.rooms.delete(roomId)
        console.log('Background: Room closed', roomId)
      }
    }

    sendResponse({ success: true })
  }

  async handleSignaling(request, sender, sendResponse) {
    // Handle WebRTC signaling messages
    const { type, roomId, targetId, data } = request
    
    const room = this.rooms.get(roomId)
    if (!room) {
      sendResponse({ success: false, error: 'Room not found' })
      return
    }

    // Forward signaling message to target tab
    let targetTabId = null
    
    if (targetId === room.hostId) {
      targetTabId = room.hostTabId
    } else {
      const participant = room.participants.get(targetId)
      targetTabId = participant?.tabId
    }

    if (targetTabId) {
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      browserAPI.tabs.sendMessage(targetTabId, {
        action: 'signaling',
        type,
        senderId: request.senderId,
        data
      })
    }

    sendResponse({ success: true })
  }

  async handleGetConnectionAnswers(request, sender, sendResponse) {
    const { roomId } = request
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    
    try {
      // Get stored connection answers for this room
      const result = await browserAPI.storage.local.get([`answer_${roomId}`])
      const answerData = result[`answer_${roomId}`]
      
      if (answerData) {
        // Clean up after retrieving
        await browserAPI.storage.local.remove([`answer_${roomId}`])
        sendResponse({ success: true, answer: answerData.answer, fromUser: answerData.fromUser })
      } else {
        sendResponse({ success: false, error: 'No answer found' })
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message })
    }
  }

  async cleanupOldAnswers() {
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    
    try {
      const storage = await browserAPI.storage.local.get()
      const keysToRemove = []
      const cutoffTime = Date.now() - (5 * 60 * 1000) // 5 minutes

      Object.entries(storage).forEach(([key, value]) => {
        if (key.startsWith('answer_') && value.timestamp < cutoffTime) {
          keysToRemove.push(key)
        }
      })

      if (keysToRemove.length > 0) {
        await browserAPI.storage.local.remove(keysToRemove)
        console.log('Background: Cleaned up old answers', keysToRemove.length)
      }
    } catch (error) {
      console.error('Failed to cleanup old answers:', error)
    }
  }

  generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase()
  }
}

// Initialize background manager
const backgroundManager = new BackgroundManager()

// Cross-browser API compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Handle extension installation
browserAPI.runtime.onInstalled.addListener((details) => {
  console.log('Plex Watch Together extension installed/updated')
  
  if (details.reason === 'install') {
    // Set default settings
    browserAPI.storage.local.set({
      settings: {
        autoSync: true,
        syncTolerance: 1000,
        showNotifications: true
      }
    })
  }
})

// Handle tab updates to clean up rooms
browserAPI.tabs.onRemoved.addListener((tabId) => {
  // Clean up rooms when tabs are closed
  for (const [roomId, room] of backgroundManager.rooms.entries()) {
    if (room.hostTabId === tabId) {
      // Host tab closed, remove room
      backgroundManager.rooms.delete(roomId)
      console.log('Background: Room closed due to host tab closure', roomId)
    } else {
      // Check if any participants were in this tab
      for (const [userId, participant] of room.participants.entries()) {
        if (participant.tabId === tabId) {
          room.participants.delete(userId)
          console.log('Background: Participant removed due to tab closure', userId)
        }
      }
    }
  }
})

// Handle extension suspension/wake-up (Firefox may not support onSuspend)
if (browserAPI.runtime.onSuspend) {
  browserAPI.runtime.onSuspend.addListener(() => {
    console.log('Background: Extension suspending, cleaning up...')
    backgroundManager.rooms.clear()
  })
}

// Expose backgroundManager for debugging
globalThis.backgroundManager = backgroundManager