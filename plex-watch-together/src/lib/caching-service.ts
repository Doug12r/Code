import { getRedisClient } from './redis'

// Cache configuration with different TTLs for different data types
export const CACHE_CONFIG = {
  // Session and authentication
  SESSION: { ttl: 24 * 60 * 60, prefix: 'session' }, // 24 hours
  USER_PROFILE: { ttl: 60 * 60, prefix: 'user' }, // 1 hour
  
  // Plex API responses
  PLEX_LIBRARIES: { ttl: 5 * 60, prefix: 'plex:lib' }, // 5 minutes
  PLEX_MEDIA: { ttl: 2 * 60, prefix: 'plex:media' }, // 2 minutes
  PLEX_SEARCH: { ttl: 30, prefix: 'plex:search' }, // 30 seconds
  PLEX_CONNECTION: { ttl: 60, prefix: 'plex:conn' }, // 1 minute
  
  // Room and sync state
  ROOM_STATE: { ttl: 10 * 60, prefix: 'room:state' }, // 10 minutes
  SYNC_STATE: { ttl: 5, prefix: 'room:sync' }, // 5 seconds (for real-time)
  ROOM_MEMBERS: { ttl: 60, prefix: 'room:members' }, // 1 minute
  
  // Rate limiting
  RATE_LIMIT: { ttl: 60, prefix: 'rate' }, // 1 minute
  
  // Performance metrics
  METRICS: { ttl: 5 * 60, prefix: 'metrics' }, // 5 minutes
  HEALTH_CHECK: { ttl: 30, prefix: 'health' }, // 30 seconds
  
  // Chat and messages
  CHAT_HISTORY: { ttl: 60 * 60, prefix: 'chat' }, // 1 hour
  
  // API responses for external services
  API_RESPONSE: { ttl: 60, prefix: 'api' }, // 1 minute
} as const

type CacheType = keyof typeof CACHE_CONFIG
type CacheKey = string
type CacheValue = any

interface CacheMetadata {
  createdAt: number
  expiresAt: number
  hitCount?: number
  type: CacheType
}

interface CacheStats {
  hits: number
  misses: number
  sets: number
  deletes: number
  hitRate: number
}

class CachingService {
  private redis = getRedisClient()
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    hitRate: 0
  }

  // Generate cache key with prefix
  private generateKey(type: CacheType, key: string): string {
    const config = CACHE_CONFIG[type]
    return `${config.prefix}:${key}`
  }

  // Get from cache with automatic deserialization and metadata
  async get<T = any>(type: CacheType, key: string): Promise<T | null> {
    try {
      const cacheKey = this.generateKey(type, key)
      const value = await this.redis.get<T>(cacheKey)
      
      if (value !== null) {
        this.stats.hits++
        
        // Update hit count metadata
        const metaKey = `${cacheKey}:meta`
        const metadata = await this.redis.get<CacheMetadata>(metaKey)
        if (metadata) {
          metadata.hitCount = (metadata.hitCount || 0) + 1
          await this.redis.set(metaKey, metadata, { ttl: CACHE_CONFIG[type].ttl })
        }
        
        return value
      }
      
      this.stats.misses++
      return null
    } catch (error) {
      console.error(`Cache GET error for ${type}:${key}:`, error)
      this.stats.misses++
      return null
    }
  }

  // Set to cache with metadata
  async set<T = any>(type: CacheType, key: string, value: T, customTtl?: number): Promise<boolean> {
    try {
      const config = CACHE_CONFIG[type]
      const cacheKey = this.generateKey(type, key)
      const ttl = customTtl || config.ttl
      
      const success = await this.redis.set(cacheKey, value, { ttl })
      
      if (success) {
        // Set metadata
        const metadata: CacheMetadata = {
          createdAt: Date.now(),
          expiresAt: Date.now() + (ttl * 1000),
          hitCount: 0,
          type
        }
        
        const metaKey = `${cacheKey}:meta`
        await this.redis.set(metaKey, metadata, { ttl })
        
        this.stats.sets++
      }
      
      return success
    } catch (error) {
      console.error(`Cache SET error for ${type}:${key}:`, error)
      return false
    }
  }

  // Delete from cache
  async delete(type: CacheType, key: string): Promise<boolean> {
    try {
      const cacheKey = this.generateKey(type, key)
      const metaKey = `${cacheKey}:meta`
      
      const success1 = await this.redis.del(cacheKey)
      const success2 = await this.redis.del(metaKey)
      
      if (success1 || success2) {
        this.stats.deletes++
      }
      
      return success1 || success2
    } catch (error) {
      console.error(`Cache DELETE error for ${type}:${key}:`, error)
      return false
    }
  }

  // Clear all cache entries of a specific type
  async clearType(type: CacheType): Promise<number> {
    try {
      const config = CACHE_CONFIG[type]
      const pattern = `${config.prefix}:*`
      const deletedCount = await this.redis.deletePattern(pattern)
      
      // Also clear metadata
      const metaPattern = `${config.prefix}:*:meta`
      await this.redis.deletePattern(metaPattern)
      
      return deletedCount
    } catch (error) {
      console.error(`Cache CLEAR TYPE error for ${type}:`, error)
      return 0
    }
  }

  // Get or set pattern (cache-aside pattern)
  async getOrSet<T = any>(
    type: CacheType, 
    key: string, 
    fetcher: () => Promise<T>, 
    customTtl?: number
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(type, key)
    if (cached !== null) {
      return cached
    }

    // Cache miss - fetch data
    try {
      const data = await fetcher()
      
      // Set in cache for future requests
      await this.set(type, key, data, customTtl)
      
      return data
    } catch (error) {
      console.error(`Cache FETCH error for ${type}:${key}:`, error)
      throw error
    }
  }

  // Session-specific caching methods
  async getUserSession(sessionId: string) {
    return this.get('SESSION', sessionId)
  }

  async setUserSession(sessionId: string, session: any) {
    return this.set('SESSION', sessionId, session)
  }

  async deleteUserSession(sessionId: string) {
    return this.delete('SESSION', sessionId)
  }

  // Plex API caching methods
  async getPlexLibraries(serverId: string) {
    return this.get('PLEX_LIBRARIES', serverId)
  }

  async setPlexLibraries(serverId: string, libraries: any) {
    return this.set('PLEX_LIBRARIES', serverId, libraries)
  }

  async getPlexMedia(mediaKey: string) {
    return this.get('PLEX_MEDIA', mediaKey)
  }

  async setPlexMedia(mediaKey: string, media: any) {
    return this.set('PLEX_MEDIA', mediaKey, media)
  }

  async getPlexSearch(query: string, serverId: string) {
    const key = `${serverId}:${Buffer.from(query).toString('base64')}`
    return this.get('PLEX_SEARCH', key)
  }

  async setPlexSearch(query: string, serverId: string, results: any) {
    const key = `${serverId}:${Buffer.from(query).toString('base64')}`
    return this.set('PLEX_SEARCH', key, results)
  }

  // Room state caching methods
  async getRoomState(roomId: string) {
    return this.get('ROOM_STATE', roomId)
  }

  async setRoomState(roomId: string, state: any) {
    return this.set('ROOM_STATE', roomId, state)
  }

  async getSyncState(roomId: string) {
    return this.get('SYNC_STATE', roomId)
  }

  async setSyncState(roomId: string, state: any) {
    return this.set('SYNC_STATE', roomId, state)
  }

  async getRoomMembers(roomId: string) {
    return this.get('ROOM_MEMBERS', roomId)
  }

  async setRoomMembers(roomId: string, members: any) {
    return this.set('ROOM_MEMBERS', roomId, members)
  }

  // Rate limiting methods
  async incrementRateLimit(key: string, limit: number = 100): Promise<{ count: number; exceeded: boolean }> {
    const rateLimitKey = this.generateKey('RATE_LIMIT', key)
    const count = await this.redis.incr(rateLimitKey, CACHE_CONFIG.RATE_LIMIT.ttl)
    
    return {
      count,
      exceeded: count > limit
    }
  }

  async getRateLimit(key: string): Promise<number> {
    const rateLimitKey = this.generateKey('RATE_LIMIT', key)
    const count = await this.redis.get<number>(rateLimitKey)
    return count || 0
  }

  // Chat caching methods
  async getChatHistory(roomId: string, limit: number = 50) {
    const messages = await this.redis.lrange(`chat:${roomId}`, 0, limit - 1)
    return messages
  }

  async addChatMessage(roomId: string, message: any) {
    const key = `chat:${roomId}`
    await this.redis.lpush(key, message)
    
    // Keep only last 100 messages
    await this.redis.ltrim(key, 0, 99)
    
    // Set expiry on the list
    await this.redis.expire(key, CACHE_CONFIG.CHAT_HISTORY.ttl)
  }

  // Performance metrics caching
  async setMetrics(key: string, metrics: any) {
    return this.set('METRICS', key, metrics)
  }

  async getMetrics(key: string) {
    return this.get('METRICS', key)
  }

  // Health check caching
  async setHealthCheck(service: string, status: any) {
    return this.set('HEALTH_CHECK', service, status)
  }

  async getHealthCheck(service: string) {
    return this.get('HEALTH_CHECK', service)
  }

  // Batch operations
  async mget<T = any>(type: CacheType, keys: string[]): Promise<(T | null)[]> {
    try {
      const cacheKeys = keys.map(key => this.generateKey(type, key))
      const values = await this.redis.mget<T>(cacheKeys)
      
      // Update stats
      values.forEach(value => {
        if (value !== null) {
          this.stats.hits++
        } else {
          this.stats.misses++
        }
      })
      
      return values
    } catch (error) {
      console.error(`Cache MGET error for ${type}:`, error)
      return keys.map(() => null)
    }
  }

  async mset(type: CacheType, keyValues: Record<string, any>, customTtl?: number): Promise<boolean> {
    try {
      const config = CACHE_CONFIG[type]
      const ttl = customTtl || config.ttl
      
      const cacheKeyValues: Record<string, any> = {}
      for (const [key, value] of Object.entries(keyValues)) {
        const cacheKey = this.generateKey(type, key)
        cacheKeyValues[cacheKey] = value
      }
      
      const success = await this.redis.mset(cacheKeyValues, ttl)
      
      if (success) {
        this.stats.sets += Object.keys(keyValues).length
      }
      
      return success
    } catch (error) {
      console.error(`Cache MSET error for ${type}:`, error)
      return false
    }
  }

  // Cache warming - preload frequently accessed data
  async warmCache(type: CacheType, dataLoader: () => Promise<Record<string, any>>): Promise<boolean> {
    try {
      console.log(`🔥 Warming cache for type: ${type}`)
      const data = await dataLoader()
      return await this.mset(type, data)
    } catch (error) {
      console.error(`Cache warming error for ${type}:`, error)
      return false
    }
  }

  // Cache invalidation patterns
  async invalidatePattern(pattern: string): Promise<number> {
    try {
      return await this.redis.deletePattern(pattern)
    } catch (error) {
      console.error(`Cache invalidation error for pattern ${pattern}:`, error)
      return 0
    }
  }

  // Get cache metadata
  async getMetadata(type: CacheType, key: string): Promise<CacheMetadata | null> {
    const cacheKey = this.generateKey(type, key)
    const metaKey = `${cacheKey}:meta`
    return await this.redis.get<CacheMetadata>(metaKey)
  }

  // Get cache statistics
  getStats(): CacheStats & { hitRate: number } {
    const totalRequests = this.stats.hits + this.stats.misses
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0
    
    return {
      ...this.stats,
      hitRate: Math.round(hitRate * 100) / 100
    }
  }

  // Reset statistics
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      hitRate: 0
    }
  }

  // Get cache size and key count by type
  async getCacheInfo(): Promise<{
    totalKeys: number
    memoryUsed: string
    typeBreakdown: Record<CacheType, number>
  }> {
    try {
      const redisStats = await this.redis.getStats()
      const typeBreakdown: Record<string, number> = {}
      
      // Count keys by type
      for (const type of Object.keys(CACHE_CONFIG) as CacheType[]) {
        const config = CACHE_CONFIG[type]
        const pattern = `${config.prefix}:*`
        const keys = await this.redis.keys ? await this.redis.keys(pattern) : []
        typeBreakdown[type] = Array.isArray(keys) ? keys.length : 0
      }
      
      return {
        totalKeys: redisStats.keyCount,
        memoryUsed: redisStats.memory,
        typeBreakdown: typeBreakdown as Record<CacheType, number>
      }
    } catch (error) {
      console.error('Cache info error:', error)
      return {
        totalKeys: 0,
        memoryUsed: '0B',
        typeBreakdown: {} as Record<CacheType, number>
      }
    }
  }

  // Health check for caching service
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    redis: { status: 'healthy' | 'unhealthy'; latency?: number }
    stats: CacheStats & { hitRate: number }
  }> {
    const redisHealth = await this.redis.healthCheck()
    const stats = this.getStats()
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    
    if (redisHealth.status === 'unhealthy') {
      status = 'unhealthy'
    } else if (stats.hitRate < 70 && (stats.hits + stats.misses) > 100) {
      status = 'degraded' // Low hit rate might indicate cache issues
    }
    
    return {
      status,
      redis: redisHealth,
      stats
    }
  }
}

// Singleton instance
let cachingService: CachingService | null = null

export function getCachingService(): CachingService {
  if (!cachingService) {
    cachingService = new CachingService()
  }
  return cachingService
}

export default getCachingService