// Reused from existing project with adaptations for browser extension
export interface PlexMedia {
  ratingKey: string
  key: string
  type: string
  title: string
  summary?: string
  year?: number
  thumb?: string
  art?: string
  duration?: number
  addedAt: number
  updatedAt: number
  originallyAvailableAt?: string
  studio?: string
  contentRating?: string
  rating?: number
  viewCount?: number
}

// WebRTC-based sync state (adapted from socket.ts)
export interface SyncState {
  position: number
  timestamp: number
  isPlaying: boolean
  playbackRate: number
  syncVersion: number
  mediaId?: string
}

// P2P Watch Party Events (adapted from socket events)
export interface WatchPartyEvents {
  // Media control events
  play: { position: number; timestamp: number; mediaId?: string }
  pause: { position: number; timestamp: number; mediaId?: string }
  seek: { position: number; timestamp: number; mediaId?: string }
  
  // Room events
  'peer-joined': { peerId: string; userName: string }
  'peer-left': { peerId: string }
  'host-changed': { newHostId: string }
  
  // Chat events
  'chat-message': { message: string; userName: string; timestamp: number }
  
  // Sync events
  'sync-request': { requesterId: string }
  'sync-response': SyncState
  'media-changed': { mediaId: string; title: string }
}

export interface PeerConnection {
  id: string
  connection: RTCPeerConnection
  dataChannel: RTCDataChannel | null
  isHost: boolean
  userName: string
  connected: boolean
}

export interface Room {
  id: string
  hostId: string
  peers: Map<string, PeerConnection>
  currentMedia?: PlexMedia
  syncState: SyncState
  createdAt: number
}

// Extension storage interface
export interface ExtensionStorage {
  userName: string
  currentRoom?: string
  isHost: boolean
  settings: {
    autoSync: boolean
    syncTolerance: number // milliseconds
    showNotifications: boolean
  }
}

// Plex video player interface (for DOM integration)
export interface PlexVideoElement extends HTMLVideoElement {
  plexSessionId?: string
  plexMediaId?: string
}

// WebRTC signaling messages
export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'join-room' | 'room-full' | 'room-closed'
  roomId: string
  senderId: string
  targetId?: string
  data: any
}

// QR Code data structure
export interface QRCodeData {
  type: 'plex-watch-together'
  version: '1.0'
  roomId: string
  offer: RTCSessionDescriptionInit
  hostName: string
  mediaInfo?: {
    title: string
    duration: number
  }
}

export type EventCallback<T = any> = (data: T) => void

export interface EventEmitter {
  on<K extends keyof WatchPartyEvents>(event: K, callback: EventCallback<WatchPartyEvents[K]>): void
  off<K extends keyof WatchPartyEvents>(event: K, callback: EventCallback<WatchPartyEvents[K]>): void
  emit<K extends keyof WatchPartyEvents>(event: K, data: WatchPartyEvents[K]): void
}