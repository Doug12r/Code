import Redis from 'ioredis'

// Enhanced Redis client for production caching
class EnhancedRedisClient {
  private client: Redis | null = null
  private isConnected = false
  private connectionAttempts = 0
  private maxRetries = 5

  constructor() {
    this.connect()
  }

  private async connect() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
      
      this.client = new Redis(redisUrl, {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        // Connection pool settings
        family: 4,
        keepAlive: 30000,
        connectTimeout: 10000,
      })

      // Event handlers
      this.client.on('connect', () => {
        console.log('🔴 Redis connected')
        this.isConnected = true
        this.connectionAttempts = 0
      })

      this.client.on('error', (error) => {
        console.error('🔴 Redis error:', error.message)
        this.isConnected = false
        
        // Retry connection with exponential backoff
        if (this.connectionAttempts < this.maxRetries) {
          this.connectionAttempts++
          const delay = Math.pow(2, this.connectionAttempts) * 1000
          console.log(`🔄 Retrying Redis connection in ${delay}ms...`)
          setTimeout(() => this.connect(), delay)
        }
      })

      this.client.on('close', () => {
        console.log('🔴 Redis connection closed')
        this.isConnected = false
      })

      // Connect to Redis
      await this.client.connect()

    } catch (error) {
      console.error('Failed to connect to Redis:', error)
      this.isConnected = false
    }
  }

  // Health check
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy', latency?: number }> {
    if (!this.client || !this.isConnected) {
      return { status: 'unhealthy' }
    }

    try {
      const start = Date.now()
      await this.client.ping()
      const latency = Date.now() - start
      
      return { status: 'healthy', latency }
    } catch (error) {
      return { status: 'unhealthy' }
    }
  }

  // Get value with automatic JSON parsing
  async get<T = any>(key: string): Promise<T | null> {
    if (!this.client || !this.isConnected) {
      console.warn('Redis not available, skipping cache get')
      return null
    }

    try {
      const value = await this.client.get(key)
      if (!value) return null

      // Try to parse as JSON, fallback to string
      try {
        return JSON.parse(value)
      } catch {
        return value as T
      }
    } catch (error) {
      console.error('Redis GET error:', error)
      return null
    }
  }

  // Set value with automatic JSON stringification
  async set<T = any>(
    key: string, 
    value: T, 
    options?: { ttl?: number; nx?: boolean }
  ): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      console.warn('Redis not available, skipping cache set')
      return false
    }

    try {
      const serializedValue = typeof value === 'string' 
        ? value 
        : JSON.stringify(value)

      let result: string | null

      if (options?.ttl) {
        if (options.nx) {
          result = await this.client.set(key, serializedValue, 'EX', options.ttl, 'NX')
        } else {
          result = await this.client.setex(key, options.ttl, serializedValue)
        }
      } else {
        if (options?.nx) {
          result = await this.client.set(key, serializedValue, 'NX')
        } else {
          result = await this.client.set(key, serializedValue)
        }
      }

      return result === 'OK' || result === key
    } catch (error) {
      console.error('Redis SET error:', error)
      return false
    }
  }

  // Delete key
  async del(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false
    }

    try {
      const result = await this.client.del(key)
      return result > 0
    } catch (error) {
      console.error('Redis DEL error:', error)
      return false
    }
  }

  // Delete keys by pattern
  async deletePattern(pattern: string): Promise<number> {
    if (!this.client || !this.isConnected) {
      return 0
    }

    try {
      const keys = await this.client.keys(pattern)
      if (keys.length === 0) return 0

      const result = await this.client.del(...keys)
      return result
    } catch (error) {
      console.error('Redis DELETE PATTERN error:', error)
      return 0
    }
  }

  // Check if key exists
  async exists(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false
    }

    try {
      const result = await this.client.exists(key)
      return result === 1
    } catch (error) {
      console.error('Redis EXISTS error:', error)
      return false
    }
  }

  // Get TTL for key
  async ttl(key: string): Promise<number> {
    if (!this.client || !this.isConnected) {
      return -1
    }

    try {
      return await this.client.ttl(key)
    } catch (error) {
      console.error('Redis TTL error:', error)
      return -1
    }
  }

  // Increment counter
  async incr(key: string, ttl?: number): Promise<number> {
    if (!this.client || !this.isConnected) {
      return 0
    }

    try {
      const result = await this.client.incr(key)
      
      if (ttl && result === 1) {
        await this.client.expire(key, ttl)
      }
      
      return result
    } catch (error) {
      console.error('Redis INCR error:', error)
      return 0
    }
  }

  // Get multiple keys
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    if (!this.client || !this.isConnected || keys.length === 0) {
      return keys.map(() => null)
    }

    try {
      const values = await this.client.mget(...keys)
      return values.map(value => {
        if (!value) return null
        try {
          return JSON.parse(value)
        } catch {
          return value as T
        }
      })
    } catch (error) {
      console.error('Redis MGET error:', error)
      return keys.map(() => null)
    }
  }

  // Set multiple keys
  async mset(keyValues: Record<string, any>, ttl?: number): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false
    }

    try {
      const serialized: string[] = []
      
      for (const [key, value] of Object.entries(keyValues)) {
        serialized.push(key)
        serialized.push(typeof value === 'string' ? value : JSON.stringify(value))
      }

      const result = await this.client.mset(...serialized)

      // Set TTL for all keys if specified
      if (ttl && result === 'OK') {
        const keys = Object.keys(keyValues)
        await Promise.all(keys.map(key => this.client!.expire(key, ttl)))
      }

      return result === 'OK'
    } catch (error) {
      console.error('Redis MSET error:', error)
      return false
    }
  }

  // Hash operations
  async hget<T = any>(key: string, field: string): Promise<T | null> {
    if (!this.client || !this.isConnected) {
      return null
    }

    try {
      const value = await this.client.hget(key, field)
      if (!value) return null

      try {
        return JSON.parse(value)
      } catch {
        return value as T
      }
    } catch (error) {
      console.error('Redis HGET error:', error)
      return null
    }
  }

  async hset<T = any>(key: string, field: string, value: T, ttl?: number): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false
    }

    try {
      const serializedValue = typeof value === 'string' 
        ? value 
        : JSON.stringify(value)

      const result = await this.client.hset(key, field, serializedValue)
      
      if (ttl) {
        await this.client.expire(key, ttl)
      }

      return result >= 0
    } catch (error) {
      console.error('Redis HSET error:', error)
      return false
    }
  }

  // List operations for real-time features
  async lpush(key: string, ...values: any[]): Promise<number> {
    if (!this.client || !this.isConnected) {
      return 0
    }

    try {
      const serializedValues = values.map(v => 
        typeof v === 'string' ? v : JSON.stringify(v)
      )
      return await this.client.lpush(key, ...serializedValues)
    } catch (error) {
      console.error('Redis LPUSH error:', error)
      return 0
    }
  }

  async lrange<T = any>(key: string, start: number, stop: number): Promise<T[]> {
    if (!this.client || !this.isConnected) {
      return []
    }

    try {
      const values = await this.client.lrange(key, start, stop)
      return values.map(value => {
        try {
          return JSON.parse(value)
        } catch {
          return value as T
        }
      })
    } catch (error) {
      console.error('Redis LRANGE error:', error)
      return []
    }
  }

  // Pub/Sub for real-time features
  async publish(channel: string, message: any): Promise<number> {
    if (!this.client || !this.isConnected) {
      return 0
    }

    try {
      const serializedMessage = typeof message === 'string' 
        ? message 
        : JSON.stringify(message)
      return await this.client.publish(channel, serializedMessage)
    } catch (error) {
      console.error('Redis PUBLISH error:', error)
      return 0
    }
  }

  // Subscribe to channels (returns subscriber instance)
  subscribe(channels: string[], callback: (channel: string, message: any) => void): Redis {
    const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
    
    subscriber.subscribe(...channels)
    subscriber.on('message', (channel, message) => {
      try {
        const parsedMessage = JSON.parse(message)
        callback(channel, parsedMessage)
      } catch {
        callback(channel, message)
      }
    })

    return subscriber
  }

  // Get cache stats
  async getStats(): Promise<{
    connected: boolean
    memory: string
    keyCount: number
    hitRate?: number
  }> {
    if (!this.client || !this.isConnected) {
      return { connected: false, memory: '0B', keyCount: 0 }
    }

    try {
      const info = await this.client.info('memory')
      const dbsize = await this.client.dbsize()
      
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/)
      const memory = memoryMatch ? memoryMatch[1] : '0B'

      return {
        connected: true,
        memory,
        keyCount: dbsize
      }
    } catch (error) {
      console.error('Redis STATS error:', error)
      return { connected: false, memory: '0B', keyCount: 0 }
    }
  }

  // Graceful shutdown
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit()
        console.log('🔴 Redis disconnected gracefully')
      } catch (error) {
        console.error('Error disconnecting from Redis:', error)
      }
    }
  }
}

// Singleton instance
let redisClient: EnhancedRedisClient | null = null

export function getRedisClient(): EnhancedRedisClient {
  if (!redisClient) {
    redisClient = new EnhancedRedisClient()
  }
  return redisClient
}

// Graceful shutdown
process.on('SIGINT', async () => {
  if (redisClient) {
    await redisClient.disconnect()
  }
})

process.on('SIGTERM', async () => {
  if (redisClient) {
    await redisClient.disconnect()
  }
})

export default getRedisClient