import { PlexAPI, PlexLibrary, PlexMedia, PlexServer } from './plex-api'
import { getCachingService } from './caching-service'
import { createHash } from 'crypto'

// Service Configuration
interface PlexServiceConfig {
  // Caching
  librariesCacheTTL: number      // How long to cache libraries list
  mediaCacheTTL: number          // How long to cache media lists  
  serverCacheTTL: number         // How long to cache server info
  
  // Performance
  maxConcurrentRequests: number  // Max parallel requests
  requestTimeout: number         // Default request timeout
  
  // Smart Features
  enableDeduplication: boolean   // Prevent duplicate requests
  enableBatching: boolean        // Batch similar requests
  enablePrefetch: boolean        // Prefetch likely-needed data
  
  // Reliability
  maxRetries: number             // Max retry attempts for failed requests
  retryDelay: number             // Base delay between retries (ms)
  exponentialBackoff: boolean    // Use exponential backoff for retries
  
  // Health Monitoring
  healthCheckInterval: number    // How often to check server health (ms)
  connectionTimeoutThreshold: number // Consider connection slow if > this (ms)
  maxConsecutiveErrors: number   // Max errors before marking server unhealthy
}

// Cache Entry Structure
interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
  key: string
}

// Request Queue Item
interface QueuedRequest {
  id: string
  endpoint: string
  resolver: (data: any) => void
  rejecter: (error: Error) => void
  timestamp: number
}

// Performance Metrics
interface ServiceMetrics {
  totalRequests: number
  cacheHits: number
  cacheMisses: number
  deduplicatedRequests: number
  averageResponseTime: number
  errorRate: number
  successfulRequests: number
  failedRequests: number
  retryCount: number
  slowRequests: number
}

// Connection Health Status
interface ConnectionHealth {
  isHealthy: boolean
  lastCheck: number
  lastError: string | null
  consecutiveErrors: number
  latency: number
  uptime: number
  downtimeStart: number | null
}

// Error Classification
enum ErrorType {
  NETWORK = 'NETWORK',
  AUTHENTICATION = 'AUTHENTICATION', 
  SERVER = 'SERVER',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',
  UNKNOWN = 'UNKNOWN'
}

// Enhanced Error with Context
interface PlexServiceError extends Error {
  type: ErrorType
  retryable: boolean
  statusCode?: number
  context?: any
}

/**
 * Plex Service Plugin - Intelligent API Management
 * 
 * This service provides:
 * - Smart caching to avoid redundant calls
 * - Request deduplication for concurrent identical requests  
 * - Connection pooling and performance optimization
 * - Built-in error handling and retry logic
 * - Performance monitoring and metrics
 */
export class PlexService {
  private api: PlexAPI
  private config: PlexServiceConfig
  private cache = new Map<string, CacheEntry<any>>() // In-memory cache for ultra-fast access
  private redisCache = getCachingService() // Redis cache for persistence and sharing
  private requestQueue = new Map<string, QueuedRequest[]>()
  private activeRequests = new Set<string>()
  private metrics: ServiceMetrics
  private connectionHealth: ConnectionHealth
  private healthCheckTimer: NodeJS.Timeout | null = null
  
  constructor(baseUrl: string, token: string, config?: Partial<PlexServiceConfig>) {
    this.api = new PlexAPI(baseUrl, token)
    
    // Default configuration - optimized for performance and reliability
    this.config = {
      librariesCacheTTL: 5 * 60 * 1000,      // 5 minutes - libraries don't change often
      mediaCacheTTL: 2 * 60 * 1000,          // 2 minutes - media lists change more frequently
      serverCacheTTL: 10 * 60 * 1000,        // 10 minutes - server info rarely changes
      maxConcurrentRequests: 3,               // Limit concurrent requests to avoid overload
      requestTimeout: 30000,                  // 30 second timeout
      enableDeduplication: true,              // Prevent duplicate requests
      enableBatching: false,                  // Start simple, add later
      enablePrefetch: false,                  // Start simple, add later
      maxRetries: 3,                          // Retry failed requests up to 3 times
      retryDelay: 1000,                       // Start with 1 second delay
      exponentialBackoff: true,               // Use exponential backoff
      healthCheckInterval: 60000,             // Check health every minute
      connectionTimeoutThreshold: 5000,       // Consider slow if > 5 seconds
      maxConsecutiveErrors: 5,                // Mark unhealthy after 5 consecutive errors
      ...config
    }
    
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      deduplicatedRequests: 0,
      averageResponseTime: 0,
      errorRate: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retryCount: 0,
      slowRequests: 0
    }
    
    // Initialize connection health
    this.connectionHealth = {
      isHealthy: true,
      lastCheck: Date.now(),
      lastError: null,
      consecutiveErrors: 0,
      latency: 0,
      uptime: Date.now(),
      downtimeStart: null
    }
    
    // Start health monitoring
    this.startHealthMonitoring()
    
    console.log('🔌 Plex Service Plugin initialized with config:', this.config)
  }
  
  /**
   * Get cache key for a request
   */
  private getCacheKey(method: string, ...args: any[]): string {
    return `${method}:${JSON.stringify(args)}`
  }
  
  /**
   * Classify error type for proper handling
   */
  private classifyError(error: any): PlexServiceError {
    let type = ErrorType.UNKNOWN
    let retryable = false
    let statusCode: number | undefined
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      type = ErrorType.NETWORK
      retryable = true
    } else if (error.status === 401 || error.status === 403) {
      type = ErrorType.AUTHENTICATION
      retryable = false
      statusCode = error.status
    } else if (error.status >= 500) {
      type = ErrorType.SERVER
      retryable = true
      statusCode = error.status
    } else if (error.code === 'TIMEOUT') {
      type = ErrorType.TIMEOUT
      retryable = true
    } else if (error.status === 429) {
      type = ErrorType.RATE_LIMIT
      retryable = true
      statusCode = 429
    }
    
    return Object.assign(error, {
      type,
      retryable,
      statusCode,
      context: error.context || {}
    }) as PlexServiceError
  }
  
  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    if (!this.config.exponentialBackoff) {
      return this.config.retryDelay
    }
    
    // Exponential backoff: delay * (2 ^ attempt) + random jitter
    const delay = this.config.retryDelay * Math.pow(2, attempt)
    const jitter = Math.random() * 1000 // Up to 1 second jitter
    return Math.min(delay + jitter, 30000) // Cap at 30 seconds
  }
  
  /**
   * Sleep for specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
  
  /**
   * Start periodic health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
    }
    
    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.performHealthCheck()
      } catch (error) {
        console.warn('🚑 Health check error:', error)
      }
    }, this.config.healthCheckInterval)
  }
  
  /**
   * Perform health check on Plex server
   */
  private async performHealthCheck(): Promise<void> {
    const startTime = Date.now()
    
    try {
      // Quick health check - just ping the identity endpoint
      await this.api.getServerIdentity()
      
      const latency = Date.now() - startTime
      
      // Update health status
      this.connectionHealth.isHealthy = true
      this.connectionHealth.lastCheck = Date.now()
      this.connectionHealth.latency = latency
      this.connectionHealth.consecutiveErrors = 0
      this.connectionHealth.lastError = null
      
      if (this.connectionHealth.downtimeStart) {
        console.log(`✅ Plex server recovered after ${Date.now() - this.connectionHealth.downtimeStart}ms downtime`)
        this.connectionHealth.downtimeStart = null
      }
      
    } catch (error) {
      const errorInfo = this.classifyError(error)
      
      this.connectionHealth.consecutiveErrors++
      this.connectionHealth.lastError = errorInfo.message
      this.connectionHealth.lastCheck = Date.now()
      
      if (this.connectionHealth.consecutiveErrors >= this.config.maxConsecutiveErrors) {
        if (this.connectionHealth.isHealthy) {
          this.connectionHealth.isHealthy = false
          this.connectionHealth.downtimeStart = Date.now()
          console.warn(`⚠️ Plex server marked as unhealthy after ${this.connectionHealth.consecutiveErrors} consecutive errors`)
        }
      }
    }
  }
  
  /**
   * Stop health monitoring
   */
  private stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }
  
  /**
   * Check if cache entry is valid
   */
  private isCacheValid<T>(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp < entry.ttl
  }
  
  /**
   * Enhanced multi-layered cache retrieval (Memory -> Redis -> Source)
   */
  private async getFromCache<T>(key: string): Promise<T | null> {
    // Layer 1: In-memory cache (fastest)
    const memoryEntry = this.cache.get(key)
    if (memoryEntry && this.isCacheValid(memoryEntry)) {
      this.metrics.cacheHits++
      console.log(`⚡ Memory Cache HIT: ${key}`)
      return memoryEntry.data
    }
    
    // Clean expired memory cache
    if (memoryEntry) {
      this.cache.delete(key)
      console.log(`🗑️ Memory Cache EXPIRED: ${key}`)
    }
    
    // Layer 2: Redis cache (persistent, shared across instances)
    try {
      const redisData = await this.redisCache.getPlexMedia(key)
      if (redisData) {
        this.metrics.cacheHits++
        console.log(`🔴 Redis Cache HIT: ${key}`)
        
        // Populate memory cache for faster future access
        this.setLocalCache(key, redisData, this.config.mediaCacheTTL)
        
        return redisData
      }
    } catch (error) {
      console.warn(`Redis cache retrieval failed for ${key}:`, error)
    }
    
    this.metrics.cacheMisses++
    return null
  }

  /**
   * Synchronous memory cache retrieval for backwards compatibility
   */
  private getFromMemoryCache<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (entry && this.isCacheValid(entry)) {
      this.metrics.cacheHits++
      console.log(`📦 Memory Cache HIT: ${key}`)
      return entry.data
    }
    
    if (entry) {
      this.cache.delete(key) // Remove expired entry
      console.log(`🗑️ Memory Cache EXPIRED: ${key}`)
    }
    
    this.metrics.cacheMisses++
    return null
  }
  
  /**
   * Enhanced multi-layered cache storage (Memory + Redis)
   */
  private async setCache<T>(key: string, data: T, ttl: number): Promise<void> {
    // Store in memory cache for ultra-fast access
    this.setLocalCache(key, data, ttl)
    
    // Store in Redis cache for persistence and sharing
    try {
      await this.redisCache.setPlexMedia(key, data)
      console.log(`🔴 Redis Cache SET: ${key} (TTL: ${ttl}ms)`)
    } catch (error) {
      console.warn(`Redis cache storage failed for ${key}:`, error)
    }
  }

  /**
   * Store data in local memory cache only
   */
  private setLocalCache<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      key
    })
    console.log(`💾 Memory Cache SET: ${key} (TTL: ${ttl}ms)`)
  }
  
  /**
   * Execute request with enhanced multi-layered caching and deduplication
   */
  private async executeRequest<T>(
    key: string, 
    requestFn: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    // Check cache first (both memory and Redis)
    const cached = await this.getFromCache<T>(key)
    if (cached !== null) {
      return cached
    }
    
    // Check if identical request is already in progress (deduplication)
    if (this.config.enableDeduplication && this.activeRequests.has(key)) {
      console.log(`🔄 Request DEDUPLICATION: ${key}`)
      this.metrics.deduplicatedRequests++
      
      return new Promise<T>((resolve, reject) => {
        if (!this.requestQueue.has(key)) {
          this.requestQueue.set(key, [])
        }
        
        this.requestQueue.get(key)!.push({
          id: Math.random().toString(36),
          endpoint: key,
          resolver: resolve,
          rejecter: reject,
          timestamp: Date.now()
        })
      })
    }
    
    // Execute the request with retry logic
    return this.executeWithRetry(key, requestFn, ttl)
  }
  
  /**
   * Execute request with retry logic and metrics tracking
   */
  private async executeWithRetry<T>(
    key: string,
    requestFn: () => Promise<T>,
    ttl: number,
    attempt = 0
  ): Promise<T> {
    this.activeRequests.add(key)
    const startTime = Date.now()
    
    try {
      if (attempt === 0) {
        console.log(`🚀 Executing request: ${key}`)
        this.metrics.totalRequests++
      } else {
        console.log(`🔄 Retry attempt ${attempt} for: ${key}`)
        this.metrics.retryCount++
      }
      
      const result = await requestFn()
      const responseTime = Date.now() - startTime
      
      // Update metrics
      this.metrics.successfulRequests++
      this.metrics.averageResponseTime = (
        (this.metrics.averageResponseTime * (this.metrics.successfulRequests - 1) + responseTime) / 
        this.metrics.successfulRequests
      )
      
      if (responseTime > this.config.connectionTimeoutThreshold) {
        this.metrics.slowRequests++
        console.warn(`🐌 Slow request detected: ${key} (${responseTime}ms)`)
      }
      
      // Cache the result in both memory and Redis
      await this.setCache(key, result, ttl)
      
      // Resolve any queued requests for the same data
      const queuedRequests = this.requestQueue.get(key) || []
      queuedRequests.forEach(req => req.resolver(result))
      this.requestQueue.delete(key)
      
      console.log(`✅ Request completed: ${key} (${responseTime}ms)`)
      return result
      
    } catch (error) {
      const plexError = this.classifyError(error)
      
      this.metrics.failedRequests++
      this.metrics.errorRate = (
        this.metrics.failedRequests / this.metrics.totalRequests
      )
      
      // Determine if we should retry
      const shouldRetry = plexError.retryable && attempt < this.config.maxRetries
      
      if (shouldRetry) {
        const delay = this.calculateRetryDelay(attempt)
        console.warn(`⚠️ Request failed, retrying in ${delay}ms: ${key} (${plexError.type})`)
        
        await this.sleep(delay)
        
        // Recursive retry
        return this.executeWithRetry(key, requestFn, ttl, attempt + 1)
      }
      
      // Final failure - reject all queued requests
      const queuedRequests = this.requestQueue.get(key) || []
      queuedRequests.forEach(req => req.rejecter(plexError))
      this.requestQueue.delete(key)
      
      console.error(`❌ Request failed permanently: ${key} (${plexError.type})`, plexError)
      throw plexError
      
    } finally {
      this.activeRequests.delete(key)
    }
  }
  
  // =============================================================================
  // PUBLIC API - Clean, Simple Methods
  // =============================================================================
  
  /**
   * Get all Plex libraries (cached)
   */
  async getLibraries(): Promise<PlexLibrary[]> {
    const key = this.getCacheKey('getLibraries')
    return this.executeRequest(
      key,
      () => this.api.getLibraries(),
      this.config.librariesCacheTTL
    )
  }
  
  /**
   * Get media from a specific library (cached)
   */
  async getLibraryMedia(libraryKey: string, start = 0, size = 50): Promise<PlexMedia[]> {
    const key = this.getCacheKey('getLibraryMedia', libraryKey, start, size)
    return this.executeRequest(
      key,
      () => this.api.getLibraryContent(libraryKey, start, size),
      this.config.mediaCacheTTL
    )
  }
  
  /**
   * Search for media (not cached - searches are dynamic)
   */
  async searchMedia(query: string): Promise<PlexMedia[]> {
    console.log(`🔍 Searching for: "${query}"`)
    this.metrics.totalRequests++
    return this.api.search(query)
  }
  
  /**
   * Get server information (cached)
   */
  async getServerInfo(): Promise<{ name: string; version: string; machineIdentifier: string } | null> {
    const key = this.getCacheKey('getServerInfo')
    return this.executeRequest(
      key,
      () => this.api.getServerIdentity(),
      this.config.serverCacheTTL
    )
  }
  
  /**
   * Test connection with diagnostics (not cached - always fresh)
   */
  async testConnection(): Promise<{
    success: boolean;
    latency?: number;
    error?: string;
    networkHealth?: any;
  }> {
    console.log(`🩺 Running connection diagnostics`)
    this.metrics.totalRequests++
    return this.api.testConnectionWithDiagnostics()
  }
  
  /**
   * Get comprehensive service metrics including health status
   */
  getMetrics(): ServiceMetrics & { 
    cacheSize: number; 
    activeRequests: number;
    cacheHitRate: number;
    successRate: number;
    health: ConnectionHealth;
    uptime: number;
  } {
    const totalCacheRequests = this.metrics.cacheHits + this.metrics.cacheMisses
    const totalCompletedRequests = this.metrics.successfulRequests + this.metrics.failedRequests
    
    return {
      ...this.metrics,
      cacheSize: this.cache.size,
      activeRequests: this.activeRequests.size,
      cacheHitRate: totalCacheRequests > 0 ? 
        Math.round((this.metrics.cacheHits / totalCacheRequests) * 100) : 0,
      successRate: totalCompletedRequests > 0 ? 
        Math.round((this.metrics.successfulRequests / totalCompletedRequests) * 100) : 0,
      health: { ...this.connectionHealth },
      uptime: Date.now() - this.connectionHealth.uptime
    }
  }
  
  /**
   * Clear all cached data
   */
  clearCache(): void {
    const size = this.cache.size
    this.cache.clear()
    console.log(`🗑️ Cache cleared (${size} entries removed)`)
  }
  
  /**
   * Preload commonly accessed data (if prefetch is enabled)
   */
  async preloadCommonData(): Promise<void> {
    if (!this.config.enablePrefetch) return
    
    console.log(`🚀 Preloading common data...`)
    
    try {
      // Preload libraries and server info in parallel
      await Promise.all([
        this.getLibraries(),
        this.getServerInfo()
      ])
      
      console.log(`✅ Preload completed`)
    } catch (error) {
      console.log(`⚠️ Preload failed:`, error)
    }
  }
  
  /**
   * Get current connection health status
   */
  getConnectionHealth(): ConnectionHealth & {
    status: 'healthy' | 'degraded' | 'unhealthy';
    downtimeDuration: number | null;
  } {
    const now = Date.now()
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    
    if (!this.connectionHealth.isHealthy) {
      status = 'unhealthy'
    } else if (this.connectionHealth.consecutiveErrors > 0 || 
               this.connectionHealth.latency > this.config.connectionTimeoutThreshold) {
      status = 'degraded'
    }
    
    const downtimeDuration = this.connectionHealth.downtimeStart 
      ? now - this.connectionHealth.downtimeStart 
      : null
    
    return {
      ...this.connectionHealth,
      status,
      downtimeDuration
    }
  }
  
  /**
   * Force a health check and return detailed connection diagnostics
   */
  async performDiagnostics(): Promise<{
    connectionTest: boolean;
    latency: number;
    serverInfo: any;
    librariesAccessible: boolean;
    errors: string[];
    recommendations: string[];
  }> {
    const diagnostics = {
      connectionTest: false,
      latency: 0,
      serverInfo: null as any,
      librariesAccessible: false,
      errors: [] as string[],
      recommendations: [] as string[]
    }
    
    console.log('🔍 Running comprehensive diagnostics...')
    
    try {
      // Test basic connection
      const startTime = Date.now()
      const serverInfo = await this.api.getServerIdentity()
      diagnostics.latency = Date.now() - startTime
      diagnostics.connectionTest = true
      diagnostics.serverInfo = serverInfo
      
      if (diagnostics.latency > 2000) {
        diagnostics.recommendations.push('Connection is slow (>2s). Check network connectivity.')
      }
      
    } catch (error: any) {
      diagnostics.errors.push(`Connection failed: ${error?.message || 'Unknown error'}`)
      diagnostics.recommendations.push('Verify Plex server URL and authentication token.')
    }
    
    try {
      // Test library access
      await this.api.getLibraries()
      diagnostics.librariesAccessible = true
      
    } catch (error: any) {
      diagnostics.errors.push(`Library access failed: ${error?.message || 'Unknown error'}`)
      diagnostics.recommendations.push('Check if token has sufficient permissions.')
    }
    
    // Performance recommendations
    const metrics = this.getMetrics()
    if (metrics.errorRate > 0.1) {
      diagnostics.recommendations.push('High error rate detected. Consider checking server stability.')
    }
    
    if (metrics.cacheHitRate < 50) {
      diagnostics.recommendations.push('Low cache hit rate. Consider increasing cache TTL values.')
    }
    
    console.log('✅ Diagnostics completed')
    return diagnostics
  }

  /**
   * Get seasons for a TV show (cached)
   */
  async getShowSeasons(showRatingKey: string): Promise<import('@/lib/plex-api').PlexSeason[]> {
    const key = this.getCacheKey('getShowSeasons', showRatingKey)
    return this.executeRequest(
      key,
      () => this.api.getShowSeasons(showRatingKey),
      this.config.mediaCacheTTL
    )
  }

  /**
   * Get episodes for a season (cached)
   */
  async getSeasonEpisodes(seasonRatingKey: string): Promise<import('@/lib/plex-api').PlexEpisode[]> {
    const key = this.getCacheKey('getSeasonEpisodes', seasonRatingKey)
    return this.executeRequest(
      key,
      () => this.api.getSeasonEpisodes(seasonRatingKey),
      this.config.mediaCacheTTL
    )
  }

  /**
   * Get all episodes for a TV show (cached)
   */
  async getShowEpisodes(showRatingKey: string): Promise<import('@/lib/plex-api').PlexEpisode[]> {
    const key = this.getCacheKey('getShowEpisodes', showRatingKey)
    return this.executeRequest(
      key,
      () => this.api.getShowEpisodes(showRatingKey),
      this.config.mediaCacheTTL
    )
  }
  
  /**
   * Cleanup resources and stop health monitoring
   */
  destroy(): void {
    this.stopHealthMonitoring()
    this.cache.clear()
    this.requestQueue.clear()
    this.activeRequests.clear()
    console.log('🗑️ Plex Service destroyed')
  }
}

// =============================================================================
// SINGLETON INSTANCE - Use throughout the app
// =============================================================================

let plexServiceInstance: PlexService | null = null

/**
 * Get or create the Plex Service singleton
 */
export function getPlexService(baseUrl?: string, token?: string, config?: Partial<PlexServiceConfig>): PlexService {
  if (!plexServiceInstance) {
    const url = baseUrl || process.env.PLEX_BASE_URL || process.env.PLEX_SERVER_URL
    const auth = token || process.env.PLEX_TOKEN
    
    if (!url || !auth) {
      throw new Error('Plex service requires base URL and authentication token. Check your environment variables PLEX_BASE_URL and PLEX_TOKEN.')
    }
    
    // Enhanced production configuration
    const defaultConfig: Partial<PlexServiceConfig> = {
      librariesCacheTTL: 5 * 60 * 1000,      // 5 minutes
      mediaCacheTTL: 2 * 60 * 1000,          // 2 minutes  
      serverCacheTTL: 10 * 60 * 1000,        // 10 minutes
      maxConcurrentRequests: 3,               // Prevent server overload
      requestTimeout: 30000,                  // 30 seconds
      enableDeduplication: true,              // Performance boost
      enablePrefetch: process.env.NODE_ENV === 'production', // Enable in production
      maxRetries: 3,                          // Retry failed requests
      exponentialBackoff: true,               // Smart retry timing
      healthCheckInterval: 60000,             // Check health every minute
      maxConsecutiveErrors: 5,                // Threshold for unhealthy status
      ...config
    }
    
    plexServiceInstance = new PlexService(url, auth, defaultConfig)
    
    // Preload common data in production
    if (process.env.NODE_ENV === 'production') {
      plexServiceInstance.preloadCommonData().catch(error => {
        console.warn('⚠️ Failed to preload Plex data:', error.message)
      })
    }
    
    console.log('🎬 Plex Service Plugin ready!')
  }
  
  return plexServiceInstance
}

/**
 * Reset the service instance (useful for testing and cleanup)
 */
export function resetPlexService(): void {
  if (plexServiceInstance) {
    plexServiceInstance.destroy()
  }
  plexServiceInstance = null
  console.log('🔄 Plex Service reset')
}

/**
 * Graceful shutdown - cleanup resources
 */
export function shutdownPlexService(): Promise<void> {
  return new Promise((resolve) => {
    if (plexServiceInstance) {
      plexServiceInstance.destroy()
      plexServiceInstance = null
      console.log('🛑 Plex Service shutdown complete')
    }
    resolve()
  })
}

// Graceful shutdown on process termination
if (typeof process !== 'undefined') {
  process.on('SIGTERM', shutdownPlexService)
  process.on('SIGINT', shutdownPlexService)
  process.on('beforeExit', shutdownPlexService)
}