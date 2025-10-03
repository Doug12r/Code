/**
 * Adaptive Streaming Manager
 * Handles dynamic quality selection based on network conditions and device capabilities
 */

export interface StreamQuality {
  id: string
  label: string
  width: number
  height: number
  bitrate: number // kbps
  codec: string
  fps?: number
  url?: string
}

export interface NetworkMetrics {
  bandwidth: number // bits per second
  latency: number // milliseconds
  packetLoss: number // percentage
  jitter: number // milliseconds
  timestamp: number
}

export interface AdaptiveStreamingConfig {
  enableAdaptive: boolean
  maxQuality: string
  minQuality: string
  bufferTarget: number // seconds
  switchThreshold: number // percentage
  stableConnectionTime: number // milliseconds
}

export class AdaptiveStreamingManager {
  private networkMetrics: NetworkMetrics[] = []
  private currentQuality: StreamQuality | null = null
  private availableQualities: StreamQuality[] = []
  private config: AdaptiveStreamingConfig
  private bandwidthHistory: number[] = []
  private qualitySwitchHistory: Array<{ quality: string; timestamp: number; reason: string }> = []
  
  // Quality levels based on common streaming standards
  private readonly QUALITY_LADDER: StreamQuality[] = [
    {
      id: 'auto',
      label: 'Auto',
      width: 0,
      height: 0,
      bitrate: 0,
      codec: 'auto'
    },
    {
      id: '240p',
      label: '240p',
      width: 426,
      height: 240,
      bitrate: 400,
      codec: 'h264',
      fps: 30
    },
    {
      id: '360p',
      label: '360p',
      width: 640,
      height: 360,
      bitrate: 800,
      codec: 'h264',
      fps: 30
    },
    {
      id: '480p',
      label: '480p SD',
      width: 854,
      height: 480,
      bitrate: 1200,
      codec: 'h264',
      fps: 30
    },
    {
      id: '720p',
      label: '720p HD',
      width: 1280,
      height: 720,
      bitrate: 2500,
      codec: 'h264',
      fps: 30
    },
    {
      id: '1080p',
      label: '1080p HD',
      width: 1920,
      height: 1080,
      bitrate: 5000,
      codec: 'h264',
      fps: 30
    },
    {
      id: '1440p',
      label: '1440p QHD',
      width: 2560,
      height: 1440,
      bitrate: 8000,
      codec: 'h264',
      fps: 30
    },
    {
      id: '2160p',
      label: '4K UHD',
      width: 3840,
      height: 2160,
      bitrate: 15000,
      codec: 'h265',
      fps: 30
    }
  ]

  constructor(config: Partial<AdaptiveStreamingConfig> = {}) {
    this.config = {
      enableAdaptive: true,
      maxQuality: '1080p',
      minQuality: '240p',
      bufferTarget: 10,
      switchThreshold: 20,
      stableConnectionTime: 5000,
      ...config
    }
    
    this.availableQualities = this.QUALITY_LADDER.slice()
  }

  /**
   * Initialize adaptive streaming for a media source
   */
  initialize(mediaUrl: string, deviceCapabilities?: Partial<StreamQuality>): StreamQuality[] {
    // Filter qualities based on device capabilities and config
    this.availableQualities = this.QUALITY_LADDER.filter(quality => {
      if (quality.id === 'auto') return true
      
      // Check if quality is within config limits
      const maxQualityIndex = this.QUALITY_LADDER.findIndex(q => q.id === this.config.maxQuality)
      const minQualityIndex = this.QUALITY_LADDER.findIndex(q => q.id === this.config.minQuality)
      const currentIndex = this.QUALITY_LADDER.findIndex(q => q.id === quality.id)
      
      if (currentIndex < minQualityIndex || currentIndex > maxQualityIndex) {
        return false
      }
      
      // Check device capabilities
      if (deviceCapabilities) {
        if (deviceCapabilities.width && quality.width > deviceCapabilities.width) return false
        if (deviceCapabilities.height && quality.height > deviceCapabilities.height) return false
      }
      
      return true
    })

    // Generate URLs for each quality (placeholder - would integrate with actual transcoding)
    this.availableQualities = this.availableQualities.map(quality => ({
      ...quality,
      url: quality.id === 'auto' ? mediaUrl : `${mediaUrl}?quality=${quality.id}`
    }))

    // Set initial quality based on estimated bandwidth
    this.currentQuality = this.selectInitialQuality()
    
    return this.availableQualities
  }

  /**
   * Update network metrics and potentially switch quality
   */
  updateNetrics(metrics: Partial<NetworkMetrics>): StreamQuality | null {
    const now = Date.now()
    
    // Add new metrics
    this.networkMetrics.push({
      bandwidth: metrics.bandwidth || 0,
      latency: metrics.latency || 0,
      packetLoss: metrics.packetLoss || 0,
      jitter: metrics.jitter || 0,
      timestamp: now
    })

    // Keep only recent metrics (last 30 seconds)
    this.networkMetrics = this.networkMetrics.filter(
      m => now - m.timestamp < 30000
    )

    // Update bandwidth history
    if (metrics.bandwidth) {
      this.bandwidthHistory.push(metrics.bandwidth)
      if (this.bandwidthHistory.length > 10) {
        this.bandwidthHistory.shift()
      }
    }

    // Check if quality switch is needed
    if (this.config.enableAdaptive && this.currentQuality?.id !== 'auto') {
      const newQuality = this.calculateOptimalQuality()
      if (newQuality && newQuality.id !== this.currentQuality?.id) {
        this.switchQuality(newQuality, 'adaptive')
        return newQuality
      }
    }

    return null
  }

  /**
   * Manually set quality level
   */
  setQuality(qualityId: string): StreamQuality | null {
    const quality = this.availableQualities.find(q => q.id === qualityId)
    if (quality) {
      this.switchQuality(quality, 'manual')
      return quality
    }
    return null
  }

  /**
   * Get current quality
   */
  getCurrentQuality(): StreamQuality | null {
    return this.currentQuality
  }

  /**
   * Get available qualities
   */
  getAvailableQualities(): StreamQuality[] {
    return this.availableQualities
  }

  /**
   * Get network quality assessment
   */
  getNetworkQuality(): {
    score: number
    category: 'excellent' | 'good' | 'fair' | 'poor'
    recommendedQuality: string
    metrics: NetworkMetrics | null
  } {
    const recentMetrics = this.getRecentMetrics()
    if (!recentMetrics) {
      return {
        score: 0,
        category: 'poor',
        recommendedQuality: '240p',
        metrics: null
      }
    }

    const { bandwidth, latency, packetLoss } = recentMetrics
    
    // Calculate network quality score (0-100)
    let score = 100
    
    // Bandwidth scoring (weight: 50%)
    const minBandwidth = 500 * 1000 // 500 kbps minimum
    const maxBandwidth = 50 * 1000 * 1000 // 50 Mbps excellent
    const bandwidthScore = Math.min(100, Math.max(0, 
      ((bandwidth - minBandwidth) / (maxBandwidth - minBandwidth)) * 100
    ))
    score = score * 0.5 + bandwidthScore * 0.5
    
    // Latency scoring (weight: 30%)
    const latencyScore = Math.max(0, 100 - (latency / 10)) // 0ms = 100, 1000ms = 0
    score = score * 0.7 + latencyScore * 0.3
    
    // Packet loss scoring (weight: 20%)
    const packetLossScore = Math.max(0, 100 - (packetLoss * 10)) // 0% = 100, 10% = 0
    score = score * 0.8 + packetLossScore * 0.2

    // Determine category and recommended quality
    let category: 'excellent' | 'good' | 'fair' | 'poor'
    let recommendedQuality: string
    
    if (score >= 80) {
      category = 'excellent'
      recommendedQuality = bandwidth > 8000000 ? '1080p' : '720p'
    } else if (score >= 60) {
      category = 'good'
      recommendedQuality = bandwidth > 3000000 ? '720p' : '480p'
    } else if (score >= 40) {
      category = 'fair'
      recommendedQuality = bandwidth > 1500000 ? '480p' : '360p'
    } else {
      category = 'poor'
      recommendedQuality = '240p'
    }

    return {
      score: Math.round(score),
      category,
      recommendedQuality,
      metrics: recentMetrics
    }
  }

  /**
   * Get streaming statistics
   */
  getStatistics() {
    return {
      currentQuality: this.currentQuality,
      qualitySwitches: this.qualitySwitchHistory.length,
      recentSwitches: this.qualitySwitchHistory.slice(-5),
      averageBandwidth: this.bandwidthHistory.length > 0 
        ? Math.round(this.bandwidthHistory.reduce((a, b) => a + b, 0) / this.bandwidthHistory.length)
        : 0,
      networkQuality: this.getNetworkQuality(),
      bufferHealth: this.calculateBufferHealth()
    }
  }

  private selectInitialQuality(): StreamQuality {
    // If we have recent bandwidth data, use it
    if (this.bandwidthHistory.length > 0) {
      const avgBandwidth = this.bandwidthHistory.reduce((a, b) => a + b, 0) / this.bandwidthHistory.length
      return this.selectQualityForBandwidth(avgBandwidth)
    }

    // Conservative default - start with medium quality
    return this.availableQualities.find(q => q.id === '480p') || this.availableQualities[1]
  }

  private calculateOptimalQuality(): StreamQuality | null {
    const networkQuality = this.getNetworkQuality()
    const recommendedQuality = this.availableQualities.find(
      q => q.id === networkQuality.recommendedQuality
    )

    if (!recommendedQuality || !this.currentQuality) return null

    // Don't switch if the change is minimal or too frequent
    const currentIndex = this.availableQualities.findIndex(q => q.id === this.currentQuality?.id)
    const recommendedIndex = this.availableQualities.findIndex(q => q.id === recommendedQuality.id)
    
    // Check if we've switched recently
    const recentSwitches = this.qualitySwitchHistory.filter(
      s => Date.now() - s.timestamp < this.config.stableConnectionTime
    )
    
    if (recentSwitches.length > 2) {
      return null // Too many recent switches
    }

    // Only switch if there's a significant difference
    if (Math.abs(currentIndex - recommendedIndex) < 2 && networkQuality.score > 50) {
      return null
    }

    return recommendedQuality
  }

  private selectQualityForBandwidth(bandwidth: number): StreamQuality {
    // Add buffer factor - use only 80% of available bandwidth
    const usableBandwidth = bandwidth * 0.8

    // Find the highest quality that fits within bandwidth
    const suitableQualities = this.availableQualities
      .filter(q => q.id !== 'auto' && q.bitrate * 1000 <= usableBandwidth)
      .sort((a, b) => b.bitrate - a.bitrate)

    return suitableQualities[0] || this.availableQualities.find(q => q.id === '240p') || this.availableQualities[1]
  }

  private switchQuality(quality: StreamQuality, reason: string) {
    const previousQuality = this.currentQuality
    this.currentQuality = quality
    
    this.qualitySwitchHistory.push({
      quality: quality.id,
      timestamp: Date.now(),
      reason
    })

    // Keep history manageable
    if (this.qualitySwitchHistory.length > 20) {
      this.qualitySwitchHistory.shift()
    }

    console.log(`🎥 Quality switched: ${previousQuality?.label || 'unknown'} → ${quality.label} (${reason})`)
  }

  private getRecentMetrics(): NetworkMetrics | null {
    if (this.networkMetrics.length === 0) return null

    // Average recent metrics (last 5 seconds)
    const recent = this.networkMetrics.filter(
      m => Date.now() - m.timestamp < 5000
    )

    if (recent.length === 0) return this.networkMetrics[this.networkMetrics.length - 1]

    return {
      bandwidth: recent.reduce((sum, m) => sum + m.bandwidth, 0) / recent.length,
      latency: recent.reduce((sum, m) => sum + m.latency, 0) / recent.length,
      packetLoss: recent.reduce((sum, m) => sum + m.packetLoss, 0) / recent.length,
      jitter: recent.reduce((sum, m) => sum + m.jitter, 0) / recent.length,
      timestamp: Date.now()
    }
  }

  private calculateBufferHealth(): {
    level: number
    status: 'critical' | 'low' | 'healthy' | 'excellent'
    recommendation: string
  } {
    // This would integrate with actual video buffer in a real implementation
    // For now, simulate based on network quality
    const networkQuality = this.getNetworkQuality()
    
    let level = 50 // Default 50% buffer
    if (networkQuality.score > 80) level = 80
    else if (networkQuality.score > 60) level = 65
    else if (networkQuality.score > 40) level = 45
    else level = 25

    let status: 'critical' | 'low' | 'healthy' | 'excellent'
    let recommendation: string

    if (level < 20) {
      status = 'critical'
      recommendation = 'Consider lowering quality or checking connection'
    } else if (level < 40) {
      status = 'low'
      recommendation = 'Buffer may need improvement'
    } else if (level < 70) {
      status = 'healthy'
      recommendation = 'Good streaming conditions'
    } else {
      status = 'excellent'
      recommendation = 'Optimal streaming performance'
    }

    return { level, status, recommendation }
  }
}

export const createAdaptiveStreamingManager = (config?: Partial<AdaptiveStreamingConfig>) => {
  return new AdaptiveStreamingManager(config)
}