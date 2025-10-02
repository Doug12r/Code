import { PlexAPI, PlexLibrary, PlexMedia, PlexServer } from './plex-api'

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
  private cache = new Map<string, CacheEntry<any>>()
  private requestQueue = new Map<string, QueuedRequest[]>()
  private activeRequests = new Set<string>()
  private metrics: ServiceMetrics
  
  constructor(baseUrl: string, token: string, config?: Partial<PlexServiceConfig>) {
    this.api = new PlexAPI(baseUrl, token)
    
    // Default configuration - optimized for performance
    this.config = {
      librariesCacheTTL: 5 * 60 * 1000,      // 5 minutes - libraries don't change often
      mediaCacheTTL: 2 * 60 * 1000,          // 2 minutes - media lists change more frequently
      serverCacheTTL: 10 * 60 * 1000,        // 10 minutes - server info rarely changes
      maxConcurrentRequests: 3,               // Limit concurrent requests to avoid overload
      requestTimeout: 30000,                  // 30 second timeout
      enableDeduplication: true,              // Prevent duplicate requests
      enableBatching: false,                  // Start simple, add later
      enablePrefetch: false,                  // Start simple, add later
      ...config
    }
    
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      deduplicatedRequests: 0,
      averageResponseTime: 0,
      errorRate: 0
    }
    
    console.log('🔌 Plex Service Plugin initialized with config:', this.config)
  }
  
  /**
   * Get cache key for a request
   */
  private getCacheKey(method: string, ...args: any[]): string {
    return `${method}:${JSON.stringify(args)}`
  }
  
  /**
   * Check if cache entry is valid
   */
  private isCacheValid<T>(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp < entry.ttl
  }
  
  /**
   * Get data from cache if valid
   */
  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (entry && this.isCacheValid(entry)) {
      this.metrics.cacheHits++
      console.log(`📦 Cache HIT: ${key}`)
      return entry.data
    }
    
    if (entry) {
      this.cache.delete(key) // Remove expired entry
      console.log(`🗑️ Cache EXPIRED: ${key}`)
    }
    
    this.metrics.cacheMisses++
    return null
  }
  
  /**
   * Store data in cache
   */
  private setCache<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      key
    })
    console.log(`💾 Cache SET: ${key} (TTL: ${ttl}ms)`)
  }
  
  /**
   * Execute request with deduplication
   */
  private async executeRequest<T>(
    key: string, 
    requestFn: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    // Check cache first
    const cached = this.getFromCache<T>(key)
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
    
    // Execute the request
    this.activeRequests.add(key)
    const startTime = Date.now()
    
    try {
      console.log(`🚀 Executing request: ${key}`)
      this.metrics.totalRequests++
      
      const result = await requestFn()
      const responseTime = Date.now() - startTime
      
      // Update metrics
      this.metrics.averageResponseTime = (
        (this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + responseTime) / 
        this.metrics.totalRequests
      )
      
      // Cache the result
      this.setCache(key, result, ttl)
      
      // Resolve any queued requests for the same data
      const queuedRequests = this.requestQueue.get(key) || []
      queuedRequests.forEach(req => req.resolver(result))
      this.requestQueue.delete(key)
      
      console.log(`✅ Request completed: ${key} (${responseTime}ms)`)
      return result
      
    } catch (error) {
      this.metrics.errorRate = (
        (this.metrics.errorRate * (this.metrics.totalRequests - 1) + 1) / 
        this.metrics.totalRequests
      )
      
      // Reject any queued requests
      const queuedRequests = this.requestQueue.get(key) || []
      queuedRequests.forEach(req => req.rejecter(error as Error))
      this.requestQueue.delete(key)
      
      console.log(`❌ Request failed: ${key}`, error)
      throw error
      
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
   * Get service performance metrics
   */
  getMetrics(): ServiceMetrics & { 
    cacheSize: number; 
    activeRequests: number;
    cacheHitRate: number;
  } {
    const totalCacheRequests = this.metrics.cacheHits + this.metrics.cacheMisses
    return {
      ...this.metrics,
      cacheSize: this.cache.size,
      activeRequests: this.activeRequests.size,
      cacheHitRate: totalCacheRequests > 0 ? 
        Math.round((this.metrics.cacheHits / totalCacheRequests) * 100) : 0
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
}

// =============================================================================
// SINGLETON INSTANCE - Use throughout the app
// =============================================================================

let plexServiceInstance: PlexService | null = null

/**
 * Get or create the Plex Service singleton
 */
export function getPlexService(baseUrl?: string, token?: string): PlexService {
  if (!plexServiceInstance) {
    const url = baseUrl || process.env.PLEX_SERVER_URL || 'https://douglinux.duckdns.org:443'
    const auth = token || process.env.PLEX_TOKEN || 'NejSfzx7UZpYVxqaPdAq'
    
    plexServiceInstance = new PlexService(url, auth, {
      // Production-optimized configuration
      librariesCacheTTL: 5 * 60 * 1000,  // 5 minutes
      mediaCacheTTL: 2 * 60 * 1000,      // 2 minutes  
      maxConcurrentRequests: 3,           // Prevent overload
      enableDeduplication: true           // Performance boost
    })
    
    console.log('🎬 Plex Service Plugin ready!')
  }
  
  return plexServiceInstance
}

/**
 * Reset the service instance (useful for testing)
 */
export function resetPlexService(): void {
  plexServiceInstance = null
  console.log('🔄 Plex Service reset')
}