/**
 * Intelligent Media Cache Management
 * Smart segment caching, cache warming, and bandwidth-aware preloading
 */

export interface CacheSegment {
  id: string
  url: string
  quality: string
  startTime: number
  duration: number
  size: number
  priority: number
  lastAccessed: number
  accessCount: number
  isPreloaded: boolean
}

export interface CacheMetrics {
  totalSize: number // bytes
  segmentCount: number
  hitRate: number // percentage
  missRate: number // percentage
  evictionCount: number
  preloadSuccessRate: number
}

export interface CacheConfiguration {
  maxCacheSize: number // bytes
  maxSegments: number
  preloadDistance: number // seconds ahead to preload
  preloadQualityLevels: number // how many quality levels to preload
  evictionPolicy: 'lru' | 'lfu' | 'priority' | 'adaptive'
  compressionEnabled: boolean
  persistentCache: boolean
  cacheWarming: boolean
}

export interface PreloadStrategy {
  enabled: boolean
  segmentsAhead: number
  qualityLevels: string[]
  bandwidth: number
  priority: 'aggressive' | 'moderate' | 'conservative'
}

export class MediaCacheManager {
  private cache = new Map<string, CacheSegment>()
  private cacheMetrics: CacheMetrics
  private config: CacheConfiguration
  private accessLog: Array<{ timestamp: number; segmentId: string; hit: boolean }> = []
  private preloadQueue: Array<{ segmentId: string; priority: number; quality: string }> = []
  private evictionHistory: Array<{ timestamp: number; segmentId: string; reason: string }> = []
  
  // Performance tracking
  private downloadSpeeds: Array<{ timestamp: number; speed: number }> = []
  private networkConditions: Array<{ timestamp: number; bandwidth: number; latency: number }> = []
  
  constructor(config: Partial<CacheConfiguration> = {}) {
    this.config = {
      maxCacheSize: 500 * 1024 * 1024, // 500MB
      maxSegments: 1000,
      preloadDistance: 30, // 30 seconds
      preloadQualityLevels: 2,
      evictionPolicy: 'adaptive',
      compressionEnabled: true,
      persistentCache: true,
      cacheWarming: true,
      ...config
    }

    this.cacheMetrics = {
      totalSize: 0,
      segmentCount: 0,
      hitRate: 0,
      missRate: 0,
      evictionCount: 0,
      preloadSuccessRate: 0
    }

    this.initializeCache()
  }

  /**
   * Get cached segment or initiate download
   */
  async getSegment(segmentId: string, url: string, quality: string): Promise<ArrayBuffer | null> {
    const now = Date.now()
    
    // Check cache first
    const cachedSegment = this.cache.get(segmentId)
    if (cachedSegment) {
      // Cache hit
      cachedSegment.lastAccessed = now
      cachedSegment.accessCount++
      
      this.logAccess(segmentId, true)
      this.updateCacheMetrics()
      
      console.log(`📦 Cache HIT: ${segmentId} (${quality})`)
      return await this.retrieveFromCache(cachedSegment)
    }

    // Cache miss - download segment
    this.logAccess(segmentId, false)
    
    try {
      console.log(`🔄 Cache MISS: Downloading ${segmentId} (${quality})`)
      const data = await this.downloadSegment(url)
      
      if (data) {
        // Store in cache
        await this.storeSegment({
          id: segmentId,
          url,
          quality,
          startTime: this.extractStartTime(segmentId),
          duration: 6, // Typical segment duration
          size: data.byteLength,
          priority: this.calculatePriority(segmentId, quality),
          lastAccessed: now,
          accessCount: 1,
          isPreloaded: false
        }, data)
        
        this.updateCacheMetrics()
        return data
      }
    } catch (error) {
      console.error(`Failed to download segment ${segmentId}:`, error)
    }

    return null
  }

  /**
   * Intelligent preloading based on current playback position and network conditions
   */
  async preloadSegments(
    currentTime: number,
    currentQuality: string,
    availableQualities: string[],
    networkBandwidth: number
  ): Promise<void> {
    const strategy = this.calculatePreloadStrategy(networkBandwidth, currentQuality, availableQualities)
    
    if (!strategy.enabled) return

    const segmentsToPreload = this.identifyPreloadSegments(
      currentTime,
      strategy.segmentsAhead,
      strategy.qualityLevels
    )

    console.log(`🚀 Preloading ${segmentsToPreload.length} segments (${strategy.priority} strategy)`)

    // Sort by priority and preload
    segmentsToPreload.sort((a, b) => b.priority - a.priority)
    
    for (const { segmentId, quality, url } of segmentsToPreload) {
      if (this.cache.has(segmentId)) continue // Already cached
      
      try {
        const data = await this.downloadSegment(url)
        if (data) {
          await this.storeSegment({
            id: segmentId,
            url,
            quality,
            startTime: this.extractStartTime(segmentId),
            duration: 6,
            size: data.byteLength,
            priority: this.calculatePriority(segmentId, quality),
            lastAccessed: Date.now(),
            accessCount: 0,
            isPreloaded: true
          }, data)

          console.log(`✅ Preloaded: ${segmentId} (${quality})`)
        }
      } catch (error) {
        console.warn(`Failed to preload ${segmentId}:`, error)
      }

      // Respect bandwidth limits
      await this.throttlePreloading(networkBandwidth)
    }
  }

  /**
   * Cache warming - preload popular content
   */
  async warmCache(popularSegments: Array<{ url: string; quality: string; popularity: number }>): Promise<void> {
    if (!this.config.cacheWarming) return

    console.log(`🔥 Warming cache with ${popularSegments.length} popular segments`)

    // Sort by popularity
    popularSegments.sort((a, b) => b.popularity - a.popularity)

    for (const { url, quality, popularity } of popularSegments.slice(0, 20)) { // Limit to top 20
      const segmentId = this.generateSegmentId(url, quality)
      
      if (this.cache.has(segmentId)) continue

      try {
        const data = await this.downloadSegment(url)
        if (data) {
          await this.storeSegment({
            id: segmentId,
            url,
            quality,
            startTime: 0,
            duration: 6,
            size: data.byteLength,
            priority: Math.floor(popularity * 100),
            lastAccessed: Date.now(),
            accessCount: 0,
            isPreloaded: true
          }, data)

          console.log(`🔥 Cache warmed: ${segmentId} (popularity: ${popularity})`)
        }
      } catch (error) {
        console.warn(`Failed to warm cache for ${segmentId}:`, error)
      }
    }
  }

  /**
   * Intelligent cache eviction
   */
  async evictSegments(requiredSpace: number): Promise<void> {
    const candidates = Array.from(this.cache.values())
    let evictedSpace = 0
    let evictedCount = 0

    console.log(`🗑️ Cache eviction needed: ${Math.round(requiredSpace / 1024 / 1024)}MB`)

    // Sort candidates based on eviction policy
    const sortedCandidates = this.sortForEviction(candidates)

    for (const segment of sortedCandidates) {
      if (evictedSpace >= requiredSpace) break

      await this.evictSegment(segment.id)
      evictedSpace += segment.size
      evictedCount++

      this.evictionHistory.push({
        timestamp: Date.now(),
        segmentId: segment.id,
        reason: this.config.evictionPolicy
      })
    }

    console.log(`🗑️ Evicted ${evictedCount} segments (${Math.round(evictedSpace / 1024 / 1024)}MB)`)
    this.cacheMetrics.evictionCount += evictedCount
    this.updateCacheMetrics()
  }

  /**
   * Get comprehensive cache analytics
   */
  getCacheAnalytics() {
    const recentAccess = this.accessLog.filter(log => Date.now() - log.timestamp < 300000)
    const hitRate = recentAccess.length > 0 
      ? (recentAccess.filter(log => log.hit).length / recentAccess.length) * 100 
      : 0

    const qualityDistribution = this.getQualityDistribution()
    const sizeByQuality = this.getSizeByQuality()
    const accessPatterns = this.getAccessPatterns()

    return {
      overview: {
        totalSize: Math.round(this.cacheMetrics.totalSize / 1024 / 1024), // MB
        segmentCount: this.cacheMetrics.segmentCount,
        hitRate: Math.round(hitRate),
        utilization: Math.round((this.cacheMetrics.totalSize / this.config.maxCacheSize) * 100)
      },
      performance: {
        recentHitRate: Math.round(hitRate),
        preloadSuccessRate: this.cacheMetrics.preloadSuccessRate,
        averageAccessTime: this.calculateAverageAccessTime(),
        bandwidth: this.getAverageBandwidth()
      },
      distribution: {
        qualityDistribution,
        sizeByQuality,
        accessPatterns
      },
      optimization: {
        recommendedEvictions: this.getEvictionRecommendations(),
        preloadOpportunities: this.getPreloadOpportunities(),
        cacheEfficiency: this.calculateCacheEfficiency()
      }
    }
  }

  /**
   * Update network conditions for cache optimization
   */
  updateNetworkConditions(bandwidth: number, latency: number): void {
    this.networkConditions.push({
      timestamp: Date.now(),
      bandwidth,
      latency
    })

    // Keep only recent data (last 10 minutes)
    this.networkConditions = this.networkConditions.filter(
      nc => Date.now() - nc.timestamp < 600000
    )
  }

  private async initializeCache(): Promise<void> {
    if (this.config.persistentCache) {
      // In a real implementation, this would load from IndexedDB or similar
      console.log('💾 Initializing persistent cache...')
    }
  }

  private async downloadSegment(url: string): Promise<ArrayBuffer> {
    const startTime = Date.now()
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.arrayBuffer()
    const endTime = Date.now()
    
    // Track download speed
    const downloadTime = (endTime - startTime) / 1000 // seconds
    const downloadSpeed = data.byteLength / downloadTime // bytes per second
    
    this.downloadSpeeds.push({
      timestamp: Date.now(),
      speed: downloadSpeed
    })

    // Keep only recent speeds
    this.downloadSpeeds = this.downloadSpeeds.filter(
      ds => Date.now() - ds.timestamp < 300000
    )

    return data
  }

  private async storeSegment(segment: CacheSegment, data: ArrayBuffer): Promise<void> {
    // Check if we need to evict
    const requiredSpace = segment.size
    const availableSpace = this.config.maxCacheSize - this.cacheMetrics.totalSize

    if (requiredSpace > availableSpace) {
      await this.evictSegments(requiredSpace - availableSpace)
    }

    // Store segment
    this.cache.set(segment.id, segment)
    
    // In a real implementation, store data in IndexedDB or similar
    // For now, we'll simulate storage
    
    this.cacheMetrics.totalSize += segment.size
    this.cacheMetrics.segmentCount++
  }

  private async retrieveFromCache(segment: CacheSegment): Promise<ArrayBuffer> {
    // In a real implementation, retrieve from IndexedDB or similar
    // For now, simulate retrieval with a small delay
    await new Promise(resolve => setTimeout(resolve, 1))
    
    // Return mock data
    return new ArrayBuffer(segment.size)
  }

  private async evictSegment(segmentId: string): Promise<void> {
    const segment = this.cache.get(segmentId)
    if (segment) {
      this.cache.delete(segmentId)
      this.cacheMetrics.totalSize -= segment.size
      this.cacheMetrics.segmentCount--
      
      // In a real implementation, remove from IndexedDB
      console.log(`🗑️ Evicted segment: ${segmentId}`)
    }
  }

  private calculatePreloadStrategy(
    bandwidth: number,
    currentQuality: string,
    availableQualities: string[]
  ): PreloadStrategy {
    // Conservative by default
    let strategy: PreloadStrategy = {
      enabled: true,
      segmentsAhead: 2,
      qualityLevels: [currentQuality],
      bandwidth,
      priority: 'conservative'
    }

    // Adjust based on bandwidth
    if (bandwidth > 10000000) { // >10Mbps
      strategy = {
        enabled: true,
        segmentsAhead: 8,
        qualityLevels: availableQualities.slice(0, 3),
        bandwidth,
        priority: 'aggressive'
      }
    } else if (bandwidth > 5000000) { // >5Mbps
      strategy = {
        enabled: true,
        segmentsAhead: 5,
        qualityLevels: [currentQuality, ...availableQualities.slice(0, 1)],
        bandwidth,
        priority: 'moderate'
      }
    } else if (bandwidth < 1000000) { // <1Mbps
      strategy.enabled = false
    }

    return strategy
  }

  private identifyPreloadSegments(
    currentTime: number,
    segmentsAhead: number,
    qualityLevels: string[]
  ): Array<{ segmentId: string; quality: string; url: string; priority: number }> {
    const segments: Array<{ segmentId: string; quality: string; url: string; priority: number }> = []
    
    for (let i = 1; i <= segmentsAhead; i++) {
      const segmentTime = currentTime + (i * 6) // 6-second segments
      
      for (let q = 0; q < qualityLevels.length; q++) {
        const quality = qualityLevels[q]
        const segmentId = `segment_${Math.floor(segmentTime / 6)}_${quality}`
        const url = `/api/media/segment/${segmentId}`
        
        // Higher priority for current quality and closer segments
        const priority = (segmentsAhead - i + 1) * (qualityLevels.length - q + 1) * 10
        
        segments.push({ segmentId, quality, url, priority })
      }
    }

    return segments
  }

  private sortForEviction(candidates: CacheSegment[]): CacheSegment[] {
    switch (this.config.evictionPolicy) {
      case 'lru':
        return candidates.sort((a, b) => a.lastAccessed - b.lastAccessed)
      
      case 'lfu':
        return candidates.sort((a, b) => a.accessCount - b.accessCount)
      
      case 'priority':
        return candidates.sort((a, b) => a.priority - b.priority)
      
      case 'adaptive':
      default:
        // Adaptive eviction considering multiple factors
        return candidates.sort((a, b) => {
          const scoreA = this.calculateEvictionScore(a)
          const scoreB = this.calculateEvictionScore(b)
          return scoreA - scoreB // Lower score = evict first
        })
    }
  }

  private calculateEvictionScore(segment: CacheSegment): number {
    const now = Date.now()
    const ageWeight = 0.3
    const accessWeight = 0.4
    const priorityWeight = 0.3

    const age = now - segment.lastAccessed
    const ageScore = Math.min(100, age / (1000 * 60 * 10)) // 10 minutes max
    const accessScore = Math.min(100, 100 - (segment.accessCount * 5))
    const priorityScore = Math.min(100, 100 - segment.priority)

    return (ageScore * ageWeight) + (accessScore * accessWeight) + (priorityScore * priorityWeight)
  }

  private async throttlePreloading(bandwidth: number): Promise<void> {
    // Throttle based on available bandwidth
    const delay = bandwidth > 5000000 ? 10 : bandwidth > 2000000 ? 50 : 100
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  private logAccess(segmentId: string, hit: boolean): void {
    this.accessLog.push({
      timestamp: Date.now(),
      segmentId,
      hit
    })

    // Keep only recent logs (last 5 minutes)
    this.accessLog = this.accessLog.filter(log => Date.now() - log.timestamp < 300000)
  }

  private updateCacheMetrics(): void {
    const recentAccess = this.accessLog.filter(log => Date.now() - log.timestamp < 300000)
    
    if (recentAccess.length > 0) {
      const hits = recentAccess.filter(log => log.hit).length
      this.cacheMetrics.hitRate = (hits / recentAccess.length) * 100
      this.cacheMetrics.missRate = 100 - this.cacheMetrics.hitRate
    }
  }

  private calculatePriority(segmentId: string, quality: string): number {
    // Higher priority for better quality and more recent segments
    const qualityPriority = this.getQualityPriority(quality)
    const segmentNumber = this.extractStartTime(segmentId)
    const recencyPriority = Math.max(0, 100 - segmentNumber)
    
    return qualityPriority + recencyPriority
  }

  private getQualityPriority(quality: string): number {
    const priorities: Record<string, number> = {
      '240p': 10,
      '360p': 20,
      '480p': 30,
      '720p': 50,
      '1080p': 70,
      '1440p': 80,
      '2160p': 90
    }
    return priorities[quality] || 30
  }

  private extractStartTime(segmentId: string): number {
    // Extract segment number from ID
    const match = segmentId.match(/segment_(\d+)/)
    return match ? parseInt(match[1], 10) * 6 : 0
  }

  private generateSegmentId(url: string, quality: string): string {
    // Generate consistent segment ID from URL and quality
    const hash = url.split('/').pop() || 'unknown'
    return `${hash}_${quality}`
  }

  private getQualityDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {}
    
    for (const segment of this.cache.values()) {
      distribution[segment.quality] = (distribution[segment.quality] || 0) + 1
    }
    
    return distribution
  }

  private getSizeByQuality(): Record<string, number> {
    const sizeByQuality: Record<string, number> = {}
    
    for (const segment of this.cache.values()) {
      sizeByQuality[segment.quality] = (sizeByQuality[segment.quality] || 0) + segment.size
    }
    
    return sizeByQuality
  }

  private getAccessPatterns(): { mostAccessed: string[]; leastAccessed: string[] } {
    const segments = Array.from(this.cache.values())
    segments.sort((a, b) => b.accessCount - a.accessCount)
    
    return {
      mostAccessed: segments.slice(0, 5).map(s => s.id),
      leastAccessed: segments.slice(-5).map(s => s.id)
    }
  }

  private getEvictionRecommendations(): string[] {
    const candidates = Array.from(this.cache.values())
    const sortedForEviction = this.sortForEviction(candidates)
    
    return sortedForEviction.slice(0, 10).map(s => s.id)
  }

  private getPreloadOpportunities(): string[] {
    // Identify segments that would benefit from preloading
    return ['Implement based on usage patterns']
  }

  private calculateCacheEfficiency(): number {
    const hitRate = this.cacheMetrics.hitRate
    const utilization = (this.cacheMetrics.totalSize / this.config.maxCacheSize) * 100
    
    // Efficiency is a balance of high hit rate and reasonable utilization
    return Math.round((hitRate * 0.7) + (Math.min(utilization, 80) * 0.3))
  }

  private calculateAverageAccessTime(): number {
    // Simulate access time based on cache hits
    return this.cacheMetrics.hitRate > 80 ? 5 : 25 // milliseconds
  }

  private getAverageBandwidth(): number {
    if (this.downloadSpeeds.length === 0) return 0
    
    const totalSpeed = this.downloadSpeeds.reduce((sum, ds) => sum + ds.speed, 0)
    return Math.round(totalSpeed / this.downloadSpeeds.length)
  }
}

export const createCacheManager = (config?: Partial<CacheConfiguration>) => {
  return new MediaCacheManager(config)
}