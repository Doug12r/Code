/**
 * Advanced Buffering System
 * Intelligent prebuffering, buffer health monitoring, and adaptive buffer sizing
 */

export interface BufferMetrics {
  bufferLength: number // seconds
  bufferHealth: number // 0-100 percentage
  downloadSpeed: number // bytes per second
  targetBufferSize: number // seconds
  isBuffering: boolean
  bufferingEvents: number
  lastBufferingTime: number
  averageBufferHealth: number
}

export interface BufferConfiguration {
  minBufferSize: number // minimum buffer size in seconds
  maxBufferSize: number // maximum buffer size in seconds
  targetBufferSize: number // target buffer size in seconds
  bufferIncrement: number // how much to increase buffer by
  bufferDecrement: number // how much to decrease buffer by
  bufferingThreshold: number // when to start buffering (percentage)
  networkQualityWeight: number // how much network quality affects buffer size
  adaptiveBuffering: boolean // enable adaptive buffer sizing
}

export interface NetworkCondition {
  bandwidth: number // bits per second
  latency: number // milliseconds
  stability: number // 0-100 percentage
  quality: 'excellent' | 'good' | 'fair' | 'poor'
}

export class AdvancedBufferingManager {
  private bufferMetrics: BufferMetrics
  private config: BufferConfiguration
  private networkCondition: NetworkCondition | null = null
  private bufferHistory: Array<{ timestamp: number; bufferLength: number; health: number }> = []
  private downloadHistory: Array<{ timestamp: number; speed: number }> = []
  private bufferingEvents: Array<{ timestamp: number; duration: number; reason: string }> = []
  
  // Buffer optimization parameters
  private readonly MIN_SAFE_BUFFER = 3 // seconds
  private readonly MAX_MEMORY_BUFFER = 60 // seconds
  private readonly BUFFER_HEALTH_SAMPLES = 10
  private readonly NETWORK_STABILITY_THRESHOLD = 80

  constructor(config: Partial<BufferConfiguration> = {}) {
    this.config = {
      minBufferSize: 5,
      maxBufferSize: 30,
      targetBufferSize: 10,
      bufferIncrement: 2,
      bufferDecrement: 1,
      bufferingThreshold: 20,
      networkQualityWeight: 0.7,
      adaptiveBuffering: true,
      ...config
    }

    this.bufferMetrics = {
      bufferLength: 0,
      bufferHealth: 100,
      downloadSpeed: 0,
      targetBufferSize: this.config.targetBufferSize,
      isBuffering: false,
      bufferingEvents: 0,
      lastBufferingTime: 0,
      averageBufferHealth: 100
    }
  }

  /**
   * Update buffer metrics based on video element state
   */
  updateBufferMetrics(video: HTMLVideoElement): BufferMetrics {
    const now = Date.now()
    
    // Calculate current buffer length
    let bufferLength = 0
    if (video.buffered.length > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1)
      bufferLength = Math.max(0, bufferedEnd - video.currentTime)
    }

    // Calculate buffer health (percentage of target buffer)
    const bufferHealth = Math.min(100, (bufferLength / this.bufferMetrics.targetBufferSize) * 100)

    // Update metrics
    this.bufferMetrics.bufferLength = bufferLength
    this.bufferMetrics.bufferHealth = bufferHealth
    
    // Store buffer history
    this.bufferHistory.push({
      timestamp: now,
      bufferLength,
      health: bufferHealth
    })

    // Keep only recent history (last 5 minutes)
    this.bufferHistory = this.bufferHistory.filter(h => now - h.timestamp < 300000)

    // Calculate average buffer health
    if (this.bufferHistory.length > 0) {
      this.bufferMetrics.averageBufferHealth = 
        this.bufferHistory.reduce((sum, h) => sum + h.health, 0) / this.bufferHistory.length
    }

    // Detect buffering events
    const wasBuffering = this.bufferMetrics.isBuffering
    const isCurrentlyBuffering = video.readyState < 3 && !video.paused

    if (isCurrentlyBuffering && !wasBuffering) {
      // Started buffering
      this.bufferMetrics.isBuffering = true
      this.bufferMetrics.bufferingEvents++
      this.bufferMetrics.lastBufferingTime = now
      
      this.bufferingEvents.push({
        timestamp: now,
        duration: 0,
        reason: this.analyzeBufferingReason()
      })
    } else if (!isCurrentlyBuffering && wasBuffering) {
      // Stopped buffering
      this.bufferMetrics.isBuffering = false
      
      // Update last buffering event duration
      if (this.bufferingEvents.length > 0) {
        const lastEvent = this.bufferingEvents[this.bufferingEvents.length - 1]
        lastEvent.duration = now - lastEvent.timestamp
      }
    }

    // Adaptive buffer sizing
    if (this.config.adaptiveBuffering) {
      this.adjustBufferSize()
    }

    return { ...this.bufferMetrics }
  }

  /**
   * Update network conditions for buffer optimization
   */
  updateNetworkCondition(condition: NetworkCondition): void {
    this.networkCondition = condition
    
    // Store download speed history
    const estimatedSpeed = condition.bandwidth / 8 // Convert to bytes per second
    this.downloadHistory.push({
      timestamp: Date.now(),
      speed: estimatedSpeed
    })

    // Keep only recent history (last 2 minutes)
    this.downloadHistory = this.downloadHistory.filter(
      h => Date.now() - h.timestamp < 120000
    )

    // Calculate average download speed
    if (this.downloadHistory.length > 0) {
      this.bufferMetrics.downloadSpeed = 
        this.downloadHistory.reduce((sum, h) => sum + h.speed, 0) / this.downloadHistory.length
    }
  }

  /**
   * Get intelligent prebuffering recommendations
   */
  getPrebufferingStrategy(videoBitrate: number): {
    shouldPrebuffer: boolean
    prebufferAmount: number // seconds
    priority: 'high' | 'medium' | 'low'
    reason: string
  } {
    const networkQuality = this.networkCondition?.quality || 'fair'
    const bufferHealth = this.bufferMetrics.bufferHealth
    const avgHealth = this.bufferMetrics.averageBufferHealth
    
    // Calculate required bandwidth for smooth playback
    const requiredBandwidth = videoBitrate * 1.2 // 20% overhead
    const availableBandwidth = this.networkCondition?.bandwidth || 0
    const bandwidthRatio = availableBandwidth / requiredBandwidth

    // Decision logic
    let shouldPrebuffer = false
    let prebufferAmount = 0
    let priority: 'high' | 'medium' | 'low' = 'low'
    let reason = 'Normal conditions'

    // High priority prebuffering conditions
    if (bufferHealth < 30 || avgHealth < 50) {
      shouldPrebuffer = true
      prebufferAmount = this.config.targetBufferSize
      priority = 'high'
      reason = 'Low buffer health detected'
    }
    // Network instability
    else if (networkQuality === 'poor' || (this.networkCondition?.stability || 100) < 60) {
      shouldPrebuffer = true
      prebufferAmount = Math.min(this.config.maxBufferSize, this.config.targetBufferSize * 1.5)
      priority = 'high'
      reason = 'Unstable network conditions'
    }
    // Insufficient bandwidth
    else if (bandwidthRatio < 1.5) {
      shouldPrebuffer = true
      prebufferAmount = this.config.targetBufferSize * 1.2
      priority = 'medium'
      reason = 'Insufficient bandwidth margin'
    }
    // Preventive prebuffering for good conditions
    else if (networkQuality === 'excellent' && bufferHealth < 80) {
      shouldPrebuffer = true
      prebufferAmount = this.config.targetBufferSize
      priority = 'low'
      reason = 'Preventive buffering on good network'
    }

    return {
      shouldPrebuffer,
      prebufferAmount,
      priority,
      reason
    }
  }

  /**
   * Get buffer optimization recommendations
   */
  getBufferOptimization(): {
    action: 'increase' | 'decrease' | 'maintain'
    newTargetSize: number
    reason: string
    urgency: 'high' | 'medium' | 'low'
  } {
    const currentTarget = this.bufferMetrics.targetBufferSize
    const bufferHealth = this.bufferMetrics.bufferHealth
    const recentBufferingEvents = this.bufferingEvents.filter(
      e => Date.now() - e.timestamp < 60000 // Last minute
    ).length
    
    let action: 'increase' | 'decrease' | 'maintain' = 'maintain'
    let newTargetSize = currentTarget
    let reason = 'Buffer size is optimal'
    let urgency: 'high' | 'medium' | 'low' = 'low'

    // Frequent buffering - increase buffer
    if (recentBufferingEvents > 2) {
      action = 'increase'
      newTargetSize = Math.min(
        this.config.maxBufferSize,
        currentTarget + this.config.bufferIncrement * 2
      )
      reason = 'Frequent buffering detected'
      urgency = 'high'
    }
    // Low buffer health - increase buffer
    else if (bufferHealth < 40) {
      action = 'increase'
      newTargetSize = Math.min(
        this.config.maxBufferSize,
        currentTarget + this.config.bufferIncrement
      )
      reason = 'Low buffer health'
      urgency = 'medium'
    }
    // Poor network - increase buffer
    else if (this.networkCondition?.quality === 'poor') {
      action = 'increase'
      newTargetSize = Math.min(
        this.config.maxBufferSize,
        currentTarget + this.config.bufferIncrement
      )
      reason = 'Poor network conditions'
      urgency = 'medium'
    }
    // Excellent conditions and over-buffering - decrease buffer
    else if (
      this.networkCondition?.quality === 'excellent' && 
      bufferHealth > 90 && 
      currentTarget > this.config.minBufferSize * 1.5
    ) {
      action = 'decrease'
      newTargetSize = Math.max(
        this.config.minBufferSize,
        currentTarget - this.config.bufferDecrement
      )
      reason = 'Excellent network, reducing buffer to save memory'
      urgency = 'low'
    }

    return { action, newTargetSize, reason, urgency }
  }

  /**
   * Apply buffer optimization
   */
  applyBufferOptimization(): void {
    const optimization = this.getBufferOptimization()
    
    if (optimization.action !== 'maintain') {
      console.log(`📊 Buffer optimization: ${optimization.action} to ${optimization.newTargetSize}s - ${optimization.reason}`)
      this.bufferMetrics.targetBufferSize = optimization.newTargetSize
    }
  }

  /**
   * Get comprehensive buffer analytics
   */
  getBufferAnalytics() {
    const now = Date.now()
    const recentBufferingEvents = this.bufferingEvents.filter(e => now - e.timestamp < 300000)
    const totalBufferingTime = recentBufferingEvents.reduce((sum, e) => sum + e.duration, 0)
    
    // Calculate buffer efficiency
    const bufferEfficiency = this.bufferHistory.length > 0 
      ? this.bufferHistory.filter(h => h.health > 50).length / this.bufferHistory.length * 100
      : 100

    // Network adaptation score
    const networkAdaptationScore = this.networkCondition 
      ? this.calculateNetworkAdaptationScore()
      : 50

    return {
      currentBuffer: {
        length: this.bufferMetrics.bufferLength,
        health: this.bufferMetrics.bufferHealth,
        targetSize: this.bufferMetrics.targetBufferSize,
        isBuffering: this.bufferMetrics.isBuffering
      },
      performance: {
        bufferEfficiency: Math.round(bufferEfficiency),
        networkAdaptationScore: Math.round(networkAdaptationScore),
        bufferingEvents: recentBufferingEvents.length,
        totalBufferingTime: Math.round(totalBufferingTime),
        averageBufferHealth: Math.round(this.bufferMetrics.averageBufferHealth)
      },
      recommendations: {
        prebuffering: this.getPrebufferingStrategy(5000), // Assume 5Mbps video
        optimization: this.getBufferOptimization()
      },
      history: {
        bufferTrend: this.getBufferTrend(),
        recentEvents: recentBufferingEvents.slice(-5)
      }
    }
  }

  private adjustBufferSize(): void {
    if (!this.networkCondition) return

    const optimization = this.getBufferOptimization()
    if (optimization.urgency === 'high' || 
       (optimization.urgency === 'medium' && Math.random() > 0.7)) {
      this.bufferMetrics.targetBufferSize = optimization.newTargetSize
    }
  }

  private analyzeBufferingReason(): string {
    if (!this.networkCondition) return 'Unknown'

    const { bandwidth, quality, latency } = this.networkCondition
    const bufferHealth = this.bufferMetrics.bufferHealth

    if (bufferHealth < 10) return 'Buffer depleted'
    if (quality === 'poor') return 'Poor network quality'
    if (bandwidth < 1000000) return 'Insufficient bandwidth' // < 1Mbps
    if (latency > 500) return 'High network latency'
    
    return 'Network congestion'
  }

  private calculateNetworkAdaptationScore(): number {
    if (!this.networkCondition) return 50

    const { quality, stability } = this.networkCondition
    const bufferHealth = this.bufferMetrics.averageBufferHealth
    const recentBuffering = this.bufferingEvents.filter(
      e => Date.now() - e.timestamp < 120000
    ).length

    let score = 100

    // Network quality impact
    switch (quality) {
      case 'poor': score -= 40; break
      case 'fair': score -= 20; break
      case 'good': score -= 5; break
      case 'excellent': break
    }

    // Stability impact
    score = score * (stability / 100)

    // Buffer health impact
    score = score * (bufferHealth / 100)

    // Recent buffering penalty
    score -= recentBuffering * 10

    return Math.max(0, Math.min(100, score))
  }

  private getBufferTrend(): 'improving' | 'stable' | 'declining' {
    if (this.bufferHistory.length < 5) return 'stable'

    const recent = this.bufferHistory.slice(-5)
    const older = this.bufferHistory.slice(-10, -5)

    if (older.length === 0) return 'stable'

    const recentAvg = recent.reduce((sum, h) => sum + h.health, 0) / recent.length
    const olderAvg = older.reduce((sum, h) => sum + h.health, 0) / older.length

    const difference = recentAvg - olderAvg

    if (difference > 10) return 'improving'
    if (difference < -10) return 'declining'
    return 'stable'
  }
}

export const createBufferingManager = (config?: Partial<BufferConfiguration>) => {
  return new AdvancedBufferingManager(config)
}