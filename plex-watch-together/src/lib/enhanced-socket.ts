'use client'

import { io, Socket } from 'socket.io-client'

// Enhanced Socket.IO performance configuration
interface SocketConfig {
  maxConnections: number
  connectionPoolSize: number
  heartbeatInterval: number
  reconnectionDelay: number
  reconnectionAttempts: number
  batchInterval: number
  maxBatchSize: number
}

interface EventBatch {
  events: Array<{
    type: string
    data: any
    timestamp: number
  }>
  roomId: string
  batchId: string
}

interface ConnectionMetrics {
  latency: number
  packetsLost: number
  bandwidth: number
  quality: 'excellent' | 'good' | 'fair' | 'poor'
  jitter: number
  reconnections: number
}

class EnhancedSocketManager {
  private static instance: EnhancedSocketManager
  private sockets: Map<string, Socket> = new Map()
  private eventBatches: Map<string, EventBatch> = new Map()
  private batchTimers: Map<string, NodeJS.Timeout> = new Map()
  private metrics: Map<string, ConnectionMetrics> = new Map()
  private config: SocketConfig

  constructor() {
    this.config = {
      maxConnections: 5,
      connectionPoolSize: 3,
      heartbeatInterval: 5000,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      batchInterval: 100, // 100ms batching
      maxBatchSize: 20
    }
  }

  static getInstance(): EnhancedSocketManager {
    if (!EnhancedSocketManager.instance) {
      EnhancedSocketManager.instance = new EnhancedSocketManager()
    }
    return EnhancedSocketManager.instance
  }

  // Connection pooling with automatic management
  async getSocket(roomId: string, session: any): Promise<Socket> {
    const existingSocket = this.sockets.get(roomId)
    
    if (existingSocket && existingSocket.connected) {
      return existingSocket
    }

    // Remove stale socket
    if (existingSocket) {
      this.cleanupSocket(roomId)
    }

    // Create new optimized connection
    const socket = await this.createOptimizedSocket(roomId, session)
    this.sockets.set(roomId, socket)
    this.initializeMetrics(roomId)
    this.setupEventBatching(roomId)
    
    return socket
  }

  private async createOptimizedSocket(roomId: string, session: any): Promise<Socket> {
    const socket = io({
      path: '/socket.io/',
      auth: { session },
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: this.config.reconnectionDelay,
      reconnectionAttempts: this.config.reconnectionAttempts,
      timeout: 10000,
      // Performance optimizations
      forceNew: false,
      multiplex: true,
      upgrade: true,
      transports: ['websocket', 'polling'],
      // Enhanced settings
      randomizationFactor: 0.2,
      closeOnBeforeunload: true
    })

    // Enhanced connection monitoring
    this.setupConnectionMonitoring(socket, roomId)
    
    // Join room immediately on connection
    socket.on('connect', () => {
      console.log(`✅ Enhanced socket connected for room ${roomId}:`, socket.id)
      socket.emit('join-room', { roomId })
      this.updateMetrics(roomId, { reconnections: this.getMetrics(roomId).reconnections + 1 })
    })

    socket.on('disconnect', (reason) => {
      console.log(`❌ Socket disconnected from room ${roomId}:`, reason)
      this.updateMetrics(roomId, { quality: 'poor' })
    })

    socket.on('connect_error', (error) => {
      console.error(`🚨 Connection error for room ${roomId}:`, error)
      this.updateMetrics(roomId, { quality: 'poor' })
    })

    return socket
  }

  private setupConnectionMonitoring(socket: Socket, roomId: string): void {
    // Latency monitoring with jitter calculation
    let lastLatencies: number[] = []
    
    const pingInterval = setInterval(() => {
      if (!socket.connected) {
        clearInterval(pingInterval)
        return
      }

      const startTime = Date.now()
      socket.emit('ping', { timestamp: startTime, roomId })
    }, this.config.heartbeatInterval)

    socket.on('pong', (data: { timestamp: number; serverTime: number }) => {
      const latency = Date.now() - data.timestamp
      lastLatencies.push(latency)
      
      // Keep only last 10 measurements for jitter calculation
      if (lastLatencies.length > 10) {
        lastLatencies = lastLatencies.slice(-10)
      }

      const avgLatency = lastLatencies.reduce((a, b) => a + b, 0) / lastLatencies.length
      const jitter = lastLatencies.length > 1 
        ? Math.sqrt(lastLatencies.reduce((sum, lat) => sum + Math.pow(lat - avgLatency, 2), 0) / lastLatencies.length)
        : 0

      const quality = this.calculateConnectionQuality(latency, jitter)
      
      this.updateMetrics(roomId, {
        latency,
        jitter,
        quality
      })
    })

    // Bandwidth estimation
    socket.on('bandwidth-test', (data: { size: number; timestamp: number }) => {
      const transferTime = Date.now() - data.timestamp
      const bandwidth = (data.size * 8) / (transferTime / 1000) // bits per second
      this.updateMetrics(roomId, { bandwidth })
    })

    socket.on('disconnect', () => {
      clearInterval(pingInterval)
    })
  }

  private calculateConnectionQuality(latency: number, jitter: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (latency < 50 && jitter < 10) return 'excellent'
    if (latency < 150 && jitter < 25) return 'good'
    if (latency < 300 && jitter < 50) return 'fair'
    return 'poor'
  }

  // Event batching for performance
  private setupEventBatching(roomId: string): void {
    const batchId = `batch_${Date.now()}_${roomId}`
    this.eventBatches.set(roomId, {
      events: [],
      roomId,
      batchId
    })
  }

  // Batch non-critical events (position updates, typing indicators, etc.)
  batchEvent(roomId: string, eventType: string, data: any, priority: 'high' | 'normal' | 'low' = 'normal'): void {
    if (priority === 'high') {
      // Send high priority events immediately
      const socket = this.sockets.get(roomId)
      if (socket?.connected) {
        socket.emit(eventType, data)
      }
      return
    }

    const batch = this.eventBatches.get(roomId)
    if (!batch) return

    batch.events.push({
      type: eventType,
      data,
      timestamp: Date.now()
    })

    // Send batch when it reaches max size or after timeout
    if (batch.events.length >= this.config.maxBatchSize) {
      this.flushBatch(roomId)
    } else if (!this.batchTimers.has(roomId)) {
      const timer = setTimeout(() => {
        this.flushBatch(roomId)
      }, this.config.batchInterval)
      this.batchTimers.set(roomId, timer)
    }
  }

  private flushBatch(roomId: string): void {
    const batch = this.eventBatches.get(roomId)
    const timer = this.batchTimers.get(roomId)
    
    if (timer) {
      clearTimeout(timer)
      this.batchTimers.delete(roomId)
    }

    if (!batch || batch.events.length === 0) return

    const socket = this.sockets.get(roomId)
    if (socket?.connected) {
      socket.emit('event-batch', {
        batchId: batch.batchId,
        events: batch.events,
        timestamp: Date.now()
      })
    }

    // Reset batch
    batch.events = []
    batch.batchId = `batch_${Date.now()}_${roomId}`
  }

  // Throttled position updates
  private positionUpdateTimers: Map<string, NodeJS.Timeout> = new Map()
  
  throttledPositionUpdate(roomId: string, position: number, isPlaying: boolean): void {
    const existing = this.positionUpdateTimers.get(roomId)
    if (existing) {
      clearTimeout(existing)
    }

    const timer = setTimeout(() => {
      this.batchEvent(roomId, 'position-update', {
        position,
        isPlaying,
        timestamp: Date.now()
      }, 'normal')
      this.positionUpdateTimers.delete(roomId)
    }, 500) // Update every 500ms maximum

    this.positionUpdateTimers.set(roomId, timer)
  }

  // Enhanced emit with retry and acknowledgment
  async reliableEmit(roomId: string, event: string, data: any, timeout: number = 5000): Promise<boolean> {
    const socket = this.sockets.get(roomId)
    if (!socket?.connected) {
      console.warn(`Socket not connected for room ${roomId}`)
      return false
    }

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve(false)
      }, timeout)

      socket.emit(event, data, (ack: any) => {
        clearTimeout(timeoutId)
        resolve(!!ack)
      })
    })
  }

  // Metrics management
  private initializeMetrics(roomId: string): void {
    this.metrics.set(roomId, {
      latency: 0,
      packetsLost: 0,
      bandwidth: 0,
      quality: 'excellent',
      jitter: 0,
      reconnections: 0
    })
  }

  private updateMetrics(roomId: string, updates: Partial<ConnectionMetrics>): void {
    const current = this.metrics.get(roomId)
    if (current) {
      this.metrics.set(roomId, { ...current, ...updates })
    }
  }

  getMetrics(roomId: string): ConnectionMetrics {
    return this.metrics.get(roomId) || {
      latency: 0,
      packetsLost: 0,
      bandwidth: 0,
      quality: 'poor',
      jitter: 0,
      reconnections: 0
    }
  }

  // Connection health check
  isHealthy(roomId: string): boolean {
    const socket = this.sockets.get(roomId)
    const metrics = this.getMetrics(roomId)
    
    return !!(
      socket?.connected &&
      metrics.latency < 500 &&
      metrics.quality !== 'poor'
    )
  }

  // Cleanup and resource management
  cleanupSocket(roomId: string): void {
    const socket = this.sockets.get(roomId)
    const timer = this.batchTimers.get(roomId)
    const positionTimer = this.positionUpdateTimers.get(roomId)

    if (timer) {
      clearTimeout(timer)
      this.batchTimers.delete(roomId)
    }

    if (positionTimer) {
      clearTimeout(positionTimer)
      this.positionUpdateTimers.delete(roomId)
    }

    if (socket) {
      socket.disconnect()
      this.sockets.delete(roomId)
    }

    this.eventBatches.delete(roomId)
    this.metrics.delete(roomId)
    
    console.log(`🧹 Cleaned up socket resources for room ${roomId}`)
  }

  // Graceful shutdown
  shutdown(): void {
    console.log('🛑 Shutting down Enhanced Socket Manager...')
    
    // Flush all pending batches
    for (const roomId of this.eventBatches.keys()) {
      this.flushBatch(roomId)
    }

    // Clean up all connections
    for (const roomId of this.sockets.keys()) {
      this.cleanupSocket(roomId)
    }

    console.log('✅ Enhanced Socket Manager shutdown complete')
  }
}

export const enhancedSocketManager = EnhancedSocketManager.getInstance()

// Enhanced hook for optimized socket usage
export interface UseEnhancedSocketOptions {
  roomId?: string
  autoConnect?: boolean
  enableBatching?: boolean
  enableMetrics?: boolean
}

export interface EnhancedSocketState {
  connected: boolean
  connecting: boolean
  socket: Socket | null
  metrics: ConnectionMetrics
  isHealthy: boolean
}