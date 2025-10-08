export class WebRTCManager {
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

  // Join an existing room
  async joinRoom(roomId, offer = null) {
    try {
      if (offer) {
        // Direct WebRTC connection via QR code
        await this.handleDirectOffer(roomId, offer)
      } else {
        // Use signaling channel
        this.sendSignalingMessage({
          type: 'join-room',
          roomId,
          senderId: this.userId,
          data: { userName: this.userName }
        })
      }
      
      return true
    } catch (error) {
      console.error('Failed to join room:', error)
      return false
    }
  }

  async handleDirectOffer(roomId, offer) {
    const peerConnection = this.createPeerConnection()
    const peerId = 'host' // We know this is from the host
    
    await peerConnection.setRemoteDescription(offer)
    const answer = await peerConnection.createAnswer()
    await peerConnection.setLocalDescription(answer)

    // Store the peer connection
    const peer = {
      id: peerId,
      connection: peerConnection,
      dataChannel: null,
      isHost: true,
      userName: 'Host',
      connected: false
    }

    if (!this.room) {
      this.room = {
        id: roomId,
        hostId: peerId,
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
    }

    this.room.peers.set(peerId, peer)

    // Set up data channel handler
    peerConnection.ondatachannel = (event) => {
      const dataChannel = event.channel
      peer.dataChannel = dataChannel
      this.setupDataChannelHandlers(peer)
    }

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('ICE candidate:', event.candidate)
      }
    }

    // For direct connection, return answer via storage
    await this.storeConnectionAnswer(roomId, answer)
  }

  async storeConnectionAnswer(roomId, answer) {
    // Store the answer in extension storage for the host to retrieve
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome
    await browserAPI.storage.local.set({
      [`answer_${roomId}`]: {
        answer,
        timestamp: Date.now(),
        fromUser: this.userName
      }
    })
  }

  createPeerConnection() {
    const peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers
    })

    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', peerConnection.connectionState)
    }

    peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', peerConnection.iceConnectionState)
    }

    return peerConnection
  }

  async handleSignalingMessage(message) {
    if (!this.room) return

    switch (message.type) {
      case 'join-room':
        if (message.roomId === this.room.id && this.isHost()) {
          await this.handlePeerJoinRequest(message.senderId, message.data.userName)
        }
        break
      
      case 'offer':
        if (message.targetId === this.userId) {
          await this.handleOffer(message.senderId, message.data)
        }
        break
      
      case 'answer':
        if (message.targetId === this.userId) {
          await this.handleAnswer(message.senderId, message.data)
        }
        break
      
      case 'ice-candidate':
        if (message.targetId === this.userId) {
          await this.handleIceCandidate(message.senderId, message.data)
        }
        break
    }
  }

  async handlePeerJoinRequest(peerId, userName) {
    if (!this.room || !this.isHost()) return

    // Create peer connection for the new peer
    const peerConnection = this.createPeerConnection()
    const dataChannel = peerConnection.createDataChannel('sync', {
      ordered: true
    })

    const peer = {
      id: peerId,
      connection: peerConnection,
      dataChannel,
      isHost: false,
      userName,
      connected: false
    }

    this.room.peers.set(peerId, peer)
    this.setupDataChannelHandlers(peer)

    // Create offer
    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)

    // Send offer to peer
    this.sendSignalingMessage({
      type: 'offer',
      roomId: this.room.id,
      senderId: this.userId,
      targetId: peerId,
      data: offer
    })

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage({
          type: 'ice-candidate',
          roomId: this.room.id,
          senderId: this.userId,
          targetId: peerId,
          data: event.candidate
        })
      }
    }
  }

  async handleOffer(senderId, offer) {
    if (!this.room) return

    const peerConnection = this.createPeerConnection()
    await peerConnection.setRemoteDescription(offer)

    const answer = await peerConnection.createAnswer()
    await peerConnection.setLocalDescription(answer)

    // Send answer
    this.sendSignalingMessage({
      type: 'answer',
      roomId: this.room.id,
      senderId: this.userId,
      targetId: senderId,
      data: answer
    })

    // Set up peer connection handlers
    const peer = {
      id: senderId,
      connection: peerConnection,
      dataChannel: null,
      isHost: senderId === this.room.hostId,
      userName: 'Unknown',
      connected: false
    }

    this.room.peers.set(senderId, peer)

    peerConnection.ondatachannel = (event) => {
      peer.dataChannel = event.channel
      this.setupDataChannelHandlers(peer)
    }

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage({
          type: 'ice-candidate',
          roomId: this.room.id,
          senderId: this.userId,
          targetId: senderId,
          data: event.candidate
        })
      }
    }
  }

  async handleAnswer(senderId, answer) {
    const peer = this.room?.peers.get(senderId)
    if (peer) {
      await peer.connection.setRemoteDescription(answer)
    }
  }

  async handleIceCandidate(senderId, candidate) {
    const peer = this.room?.peers.get(senderId)
    if (peer) {
      await peer.connection.addIceCandidate(candidate)
    }
  }

  setupDataChannelHandlers(peer) {
    if (!peer.dataChannel) return

    peer.dataChannel.onopen = () => {
      peer.connected = true
      console.log(`Data channel opened with ${peer.userName}`)
      this.emit('peer-joined', { peerId: peer.id, userName: peer.userName })
    }

    peer.dataChannel.onclose = () => {
      peer.connected = false
      this.emit('peer-left', { peerId: peer.id })
    }

    peer.dataChannel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        this.handleDataChannelMessage(peer.id, message)
      } catch (error) {
        console.error('Failed to parse data channel message:', error)
      }
    }
  }

  handleDataChannelMessage(senderId, message) {
    switch (message.type) {
      case 'play':
        this.emit('play', message.data)
        break
      case 'pause':
        this.emit('pause', message.data)
        break
      case 'seek':
        this.emit('seek', message.data)
        break
      case 'chat-message':
        this.emit('chat-message', {
          ...message.data,
          userName: this.room?.peers.get(senderId)?.userName || 'Unknown'
        })
        break
      case 'sync-request':
        if (this.isHost()) {
          this.sendSyncResponse(senderId)
        }
        break
      case 'sync-response':
        this.emit('sync-response', message.data)
        break
    }
  }

  sendSyncResponse(targetPeerId) {
    if (!this.room) return

    const syncData = {
      type: 'sync-response',
      data: this.room.syncState
    }

    const peer = this.room.peers.get(targetPeerId)
    if (peer?.dataChannel?.readyState === 'open') {
      peer.dataChannel.send(JSON.stringify(syncData))
    }
  }

  // Broadcast message to all connected peers
  broadcastToPeers(message) {
    if (!this.room) return

    const messageStr = JSON.stringify(message)
    this.room.peers.forEach(peer => {
      if (peer.connected && peer.dataChannel?.readyState === 'open') {
        peer.dataChannel.send(messageStr)
      }
    })
  }

  // Public methods for media control
  sendPlay(position, timestamp) {
    this.broadcastToPeers({
      type: 'play',
      data: { position, timestamp }
    })
  }

  sendPause(position, timestamp) {
    this.broadcastToPeers({
      type: 'pause',
      data: { position, timestamp }
    })
  }

  sendSeek(position, timestamp) {
    this.broadcastToPeers({
      type: 'seek',
      data: { position, timestamp }
    })
  }

  sendChatMessage(message) {
    this.broadcastToPeers({
      type: 'chat-message',
      data: { message, timestamp: Date.now() }
    })
  }

  updateSyncState(syncState) {
    if (this.room) {
      this.room.syncState = { ...this.room.syncState, ...syncState }
    }
  }

  // Event emitter methods
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

  sendSignalingMessage(message) {
    if (this.signalingChannel) {
      this.signalingChannel.postMessage(message)
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
      // Close all peer connections
      this.room.peers.forEach(peer => {
        peer.connection.close()
      })
      
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
}