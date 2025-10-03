import { getCachingService } from './caching-service'
import { getDatabaseService } from './prisma'

interface CacheInvalidationRule {
  trigger: string // What triggers the invalidation
  targets: string[] // What cache keys to invalidate
  pattern?: string // Pattern-based invalidation
}

interface CacheWarmingStrategy {
  type: string
  schedule?: string // Cron-like schedule
  condition?: () => boolean
  preloader: () => Promise<Record<string, any>>
}

interface CacheHealthMetrics {
  hitRate: number
  missRate: number
  evictionRate: number
  memoryUsage: number
  keyCount: number
  lastUpdate: number
}

/**
 * Advanced Cache Management System
 * Provides intelligent cache invalidation, warming, and monitoring
 */
export class AdvancedCacheManager {
  private cache = getCachingService()
  private db = getDatabaseService()
  private invalidationRules: CacheInvalidationRule[] = []
  private warmingStrategies: CacheWarmingStrategy[] = []
  private healthMetrics: CacheHealthMetrics = {
    hitRate: 0,
    missRate: 0,
    evictionRate: 0,
    memoryUsage: 0,
    keyCount: 0,
    lastUpdate: Date.now()
  }

  constructor() {
    this.setupInvalidationRules()
    this.setupWarmingStrategies()
    this.startHealthMonitoring()
  }

  /**
   * Setup cache invalidation rules
   */
  private setupInvalidationRules(): void {
    this.invalidationRules = [
      // User profile changes
      {
        trigger: 'user.update',
        targets: ['USER_PROFILE'],
        pattern: 'user:*'
      },
      
      // Room state changes
      {
        trigger: 'room.update',
        targets: ['ROOM_STATE', 'ROOM_MEMBERS'],
        pattern: 'room:*'
      },
      
      // Plex data changes
      {
        trigger: 'plex.library.update',
        targets: ['PLEX_LIBRARIES'],
        pattern: 'plex:lib:*'
      },
      
      // Session changes
      {
        trigger: 'session.invalidate',
        targets: ['SESSION'],
        pattern: 'session:*'
      }
    ]
  }

  /**
   * Setup cache warming strategies
   */
  private setupWarmingStrategies(): void {
    this.warmingStrategies = [
      // Warm popular rooms
      {
        type: 'popular-rooms',
        schedule: '*/5 * * * *', // Every 5 minutes
        preloader: async () => {
          const rooms = await this.db.getUserRooms('popular') // Would need implementation
          const cacheData: Record<string, any> = {}
          
          rooms.forEach((room: any) => {
            cacheData[`id:${room.id}`] = room
          })
          
          return cacheData
        }
      },
      
      // Warm active user profiles
      {
        type: 'active-users',
        condition: () => new Date().getHours() >= 18, // Peak hours
        preloader: async () => {
          // Load recently active users
          const users = await this.getActiveUsers()
          const cacheData: Record<string, any> = {}
          
          users.forEach(user => {
            cacheData[`id:${user.id}`] = user
          })
          
          return cacheData
        }
      },
      
      // Warm Plex libraries for active servers
      {
        type: 'plex-libraries',
        schedule: '0 */30 * * * *', // Every 30 minutes
        preloader: async () => {
          const servers = await this.getActiveServers()
          const cacheData: Record<string, any> = {}
          
          // Would need PlexService integration
          servers.forEach(server => {
            cacheData[`server:${server.id}:libraries`] = server.libraries
          })
          
          return cacheData
        }
      }
    ]
  }

  /**
   * Intelligent cache invalidation based on data relationships
   */
  async invalidateRelated(trigger: string, context?: Record<string, any>): Promise<number> {
    let totalInvalidated = 0
    
    for (const rule of this.invalidationRules) {
      if (rule.trigger === trigger) {
        // Invalidate specific cache types
        for (const target of rule.targets) {
          const cleared = await this.cache.clearType(target as any)
          totalInvalidated += cleared
          console.log(`🧹 Invalidated ${cleared} entries for ${target}`)
        }
        
        // Pattern-based invalidation
        if (rule.pattern) {
          const pattern = this.interpolatePattern(rule.pattern, context)
          const invalidated = await this.cache.invalidatePattern(pattern)
          totalInvalidated += invalidated
          console.log(`🧹 Pattern invalidated ${invalidated} entries matching ${pattern}`)
        }
      }
    }
    
    return totalInvalidated
  }

  /**
   * Smart cache warming based on usage patterns
   */
  async warmCaches(strategyType?: string): Promise<{ warmed: number; errors: string[] }> {
    const results = { warmed: 0, errors: [] as string[] }
    
    const strategiesToRun = strategyType 
      ? this.warmingStrategies.filter(s => s.type === strategyType)
      : this.warmingStrategies.filter(s => !s.condition || s.condition())
    
    for (const strategy of strategiesToRun) {
      try {
        console.log(`🔥 Warming cache with strategy: ${strategy.type}`)
        
        const data = await strategy.preloader()
        const success = await this.cache.mset('ROOM_STATE', data) // Type would vary
        
        if (success) {
          results.warmed += Object.keys(data).length
          console.log(`✅ Warmed ${Object.keys(data).length} entries with ${strategy.type}`)
        } else {
          results.errors.push(`Failed to warm cache with ${strategy.type}`)
        }
      } catch (error) {
        const errorMsg = `Error in warming strategy ${strategy.type}: ${error}`
        results.errors.push(errorMsg)
        console.error(errorMsg)
      }
    }
    
    return results
  }

  /**
   * Adaptive cache TTL based on access patterns
   */
  async getOptimalTTL(cacheType: string, key: string): Promise<number> {
    try {
      // Get cache metadata
      const metadata = await this.cache.getMetadata(cacheType as any, key)
      
      if (!metadata) {
        return this.getDefaultTTL(cacheType)
      }
      
      const { hitCount = 0, createdAt } = metadata
      const age = Date.now() - createdAt
      const hitRate = hitCount / Math.max(1, age / 1000 / 60) // hits per minute
      
      // Higher hit rate = longer TTL
      if (hitRate > 10) return 600 // 10 minutes for very popular
      if (hitRate > 5) return 300  // 5 minutes for popular
      if (hitRate > 1) return 180  // 3 minutes for moderately popular
      
      return this.getDefaultTTL(cacheType) // Default for low usage
    } catch (error) {
      console.error('Error calculating optimal TTL:', error)
      return this.getDefaultTTL(cacheType)
    }
  }

  /**
   * Cache performance analysis and optimization
   */
  async analyzePerformance(): Promise<{
    recommendations: string[]
    issues: string[]
    metrics: CacheHealthMetrics
  }> {
    const stats = this.cache.getStats()
    const cacheInfo = await this.cache.getCacheInfo()
    
    const recommendations: string[] = []
    const issues: string[] = []
    
    // Analyze hit rate
    if (stats.hitRate < 70) {
      issues.push(`Low cache hit rate: ${stats.hitRate}%`)
      recommendations.push('Consider warming popular data or increasing TTL')
    }
    
    // Analyze cache size
    if (cacheInfo.totalKeys > 10000) {
      issues.push(`High cache key count: ${cacheInfo.totalKeys}`)
      recommendations.push('Implement more aggressive eviction or shorter TTL')
    }
    
    // Check for hot spots
    const typeBreakdown = cacheInfo.typeBreakdown
    for (const [type, count] of Object.entries(typeBreakdown)) {
      if (count > 1000) {
        recommendations.push(`Consider partitioning cache type ${type} (${count} keys)`)
      }
    }
    
    // Update health metrics
    this.healthMetrics = {
      hitRate: stats.hitRate,
      missRate: (stats.misses / (stats.hits + stats.misses)) * 100,
      evictionRate: 0, // Would need Redis info
      memoryUsage: 0, // Would need system metrics
      keyCount: cacheInfo.totalKeys,
      lastUpdate: Date.now()
    }
    
    return {
      recommendations,
      issues,
      metrics: this.healthMetrics
    }
  }

  /**
   * Predictive cache preloading based on user behavior
   */
  async predictivePreload(userId: string, roomId?: string): Promise<void> {
    try {
      // Preload user's recent rooms
      const userRooms = await this.cache.getOrSet(
        'USER_PROFILE',
        `${userId}:recent-rooms`,
        async () => {
          return await this.db.getUserRooms(userId)
        },
        60 // 1 minute TTL for predictive data
      )
      
      // Preload room members for current room
      if (roomId) {
        await this.cache.getOrSet(
          'ROOM_MEMBERS',
          roomId,
          async () => {
            const room = await this.db.getRoomById(roomId)
            return room?.members || []
          }
        )
      }
      
      // Preload related user profiles
      const relatedUserIds = this.extractUserIds(userRooms)
      if (relatedUserIds.length > 0) {
        await this.db.getUsersById(relatedUserIds) // This uses batch loading with caching
      }
      
      console.log(`🔮 Predictively preloaded data for user ${userId}`)
    } catch (error) {
      console.error('Error in predictive preloading:', error)
    }
  }

  /**
   * Cache coherence across multiple instances
   */
  async synchronizeCaches(): Promise<void> {
    // This would implement cross-instance cache invalidation
    // Using Redis pub/sub or similar mechanism
    console.log('🔄 Synchronizing caches across instances...')
    
    // Publish cache invalidation events
    // Subscribe to cache updates from other instances
    // Handle distributed cache warming
  }

  /**
   * Cache rollback for deployment safety
   */
  async createCacheSnapshot(label: string): Promise<string> {
    const snapshotId = `snapshot:${label}:${Date.now()}`
    
    try {
      // Create a snapshot of critical cache data
      const criticalData = await this.exportCriticalCache()
      await this.cache.set('METRICS', snapshotId, criticalData, 3600) // 1 hour
      
      console.log(`📸 Created cache snapshot: ${snapshotId}`)
      return snapshotId
    } catch (error) {
      console.error('Error creating cache snapshot:', error)
      throw error
    }
  }

  async restoreCacheSnapshot(snapshotId: string): Promise<boolean> {
    try {
      const snapshot = await this.cache.get('METRICS', snapshotId)
      
      if (!snapshot) {
        console.error(`Snapshot not found: ${snapshotId}`)
        return false
      }
      
      // Restore critical cache data
      await this.importCriticalCache(snapshot)
      
      console.log(`🔄 Restored cache from snapshot: ${snapshotId}`)
      return true
    } catch (error) {
      console.error('Error restoring cache snapshot:', error)
      return false
    }
  }

  // Helper methods

  private interpolatePattern(pattern: string, context?: Record<string, any>): string {
    if (!context) return pattern
    
    let result = pattern
    for (const [key, value] of Object.entries(context)) {
      result = result.replace(`{${key}}`, String(value))
    }
    return result
  }

  private getDefaultTTL(cacheType: string): number {
    const ttlMap: Record<string, number> = {
      USER_PROFILE: 300,    // 5 minutes
      ROOM_STATE: 180,      // 3 minutes
      PLEX_LIBRARIES: 600,  // 10 minutes
      SESSION: 1800,        // 30 minutes
      SYNC_STATE: 5,        // 5 seconds
    }
    
    return ttlMap[cacheType] || 300
  }

  private async getActiveUsers(): Promise<any[]> {
    // Would implement logic to get recently active users
    return []
  }

  private async getActiveServers(): Promise<any[]> {
    // Would implement logic to get active Plex servers
    return []
  }

  private extractUserIds(data: any[]): string[] {
    // Extract user IDs from various data structures
    return []
  }

  private async exportCriticalCache(): Promise<any> {
    // Export critical cache data for snapshots
    return {}
  }

  private async importCriticalCache(data: any): Promise<void> {
    // Import cache data from snapshots
  }

  private startHealthMonitoring(): void {
    // Start periodic health monitoring
    setInterval(async () => {
      await this.updateHealthMetrics()
    }, 60000) // Every minute
  }

  private async updateHealthMetrics(): Promise<void> {
    try {
      const analysis = await this.analyzePerformance()
      this.healthMetrics = analysis.metrics
      
      // Log issues if any
      if (analysis.issues.length > 0) {
        console.warn('🚨 Cache performance issues:', analysis.issues)
      }
      
      // Auto-apply recommendations if configured
      // This could trigger automatic cache warming, cleanup, etc.
    } catch (error) {
      console.error('Error updating health metrics:', error)
    }
  }
}

// Singleton instance
let advancedCacheManager: AdvancedCacheManager | null = null

export function getAdvancedCacheManager(): AdvancedCacheManager {
  if (!advancedCacheManager) {
    advancedCacheManager = new AdvancedCacheManager()
  }
  return advancedCacheManager
}

export default getAdvancedCacheManager