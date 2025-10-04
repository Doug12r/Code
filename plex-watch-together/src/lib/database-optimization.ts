import { PrismaClient } from '@prisma/client'
import { DatabasePerformanceTracker, PerformanceTracker } from './performance-analytics'
import { AppLogger } from './structured-logging'

// Database optimization configuration
interface QueryOptimizationConfig {
  slowQueryThreshold: number // milliseconds
  enableCaching: boolean
  cacheSize: number
  cacheTTL: number // seconds
  enableIndexHints: boolean
  enableQueryPlan: boolean
  maxConnections: number
  connectionTimeout: number
  queryTimeout: number
}

const DEFAULT_CONFIG: QueryOptimizationConfig = {
  slowQueryThreshold: 1000,
  enableCaching: true,
  cacheSize: 1000,
  cacheTTL: 300,
  enableIndexHints: false,
  enableQueryPlan: process.env.NODE_ENV === 'development',
  maxConnections: 10,
  connectionTimeout: 10000,
  queryTimeout: 30000
}

// Query cache implementation
class QueryCache {
  private cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map()
  private maxSize: number
  private defaultTTL: number

  constructor(maxSize = 1000, defaultTTL = 300) {
    this.maxSize = maxSize
    this.defaultTTL = defaultTTL
  }

  private generateKey(query: string, params: any[]): string {
    return `${query}:${JSON.stringify(params)}`
  }

  get(query: string, params: any[] = []): any | null {
    const key = this.generateKey(query, params)
    const entry = this.cache.get(key)
    
    if (!entry) {
      return null
    }

    if (Date.now() - entry.timestamp > entry.ttl * 1000) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  set(query: string, params: any[], data: any, ttl?: number): void {
    if (this.cache.size >= this.maxSize) {
      // Simple LRU eviction - remove oldest entries
      const oldestKey = Array.from(this.cache.keys())[0]
      this.cache.delete(oldestKey)
    }

    const key = this.generateKey(query, params)
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    })
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }

  getStats(): {
    size: number
    maxSize: number
    oldestEntry: number | null
    newestEntry: number | null
  } {
    const timestamps = Array.from(this.cache.values()).map(v => v.timestamp)
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : null
    }
  }
}

// Database connection pool manager
class ConnectionPoolManager {
  private activeConnections = 0
  private maxConnections: number
  private waitingQueue: Array<{ resolve: Function; reject: Function }> = []
  private connectionTimeout: number

  constructor(maxConnections = 10, connectionTimeout = 10000) {
    this.maxConnections = maxConnections
    this.connectionTimeout = connectionTimeout
  }

  async acquireConnection(): Promise<void> {
    if (this.activeConnections < this.maxConnections) {
      this.activeConnections++
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waitingQueue.findIndex(item => item.resolve === resolve)
        if (index !== -1) {
          this.waitingQueue.splice(index, 1)
        }
        reject(new Error('Connection timeout'))
      }, this.connectionTimeout)

      this.waitingQueue.push({
        resolve: () => {
          clearTimeout(timer)
          this.activeConnections++
          resolve()
        },
        reject: () => {
          clearTimeout(timer)
          reject(new Error('Connection rejected'))
        }
      })
    })
  }

  releaseConnection(): void {
    this.activeConnections--
    
    if (this.waitingQueue.length > 0) {
      const next = this.waitingQueue.shift()
      if (next) {
        next.resolve()
      }
    }
  }

  getStats(): {
    active: number
    max: number
    waiting: number
    utilization: number
  } {
    return {
      active: this.activeConnections,
      max: this.maxConnections,
      waiting: this.waitingQueue.length,
      utilization: (this.activeConnections / this.maxConnections) * 100
    }
  }
}

// Query builder with optimization hints
class OptimizedQueryBuilder {
  private prisma: PrismaClient
  private cache: QueryCache
  private config: QueryOptimizationConfig

  constructor(prisma: PrismaClient, config: Partial<QueryOptimizationConfig> = {}) {
    this.prisma = prisma
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.cache = new QueryCache(this.config.cacheSize, this.config.cacheTTL)
  }

  // Optimized find operations with caching
  async findOptimized<T>(
    model: string,
    query: any,
    options: {
      cache?: boolean
      cacheTTL?: number
      indexes?: string[]
      timeout?: number
    } = {}
  ): Promise<T> {
    const cacheKey = `${model}:find:${JSON.stringify(query)}`
    const useCache = options.cache !== false && this.config.enableCaching
    
    // Check cache first
    if (useCache) {
      const cached = this.cache.get(cacheKey)
      if (cached) {
        AppLogger.info('Query cache hit', { model, cacheKey: cacheKey.slice(0, 50) })
        return cached
      }
    }

    const startTime = Date.now()

    try {
      // Add timeout if specified
      const queryPromise = (this.prisma as any)[model].findMany(query)
      
      const result = options.timeout 
        ? await this.withTimeout(queryPromise, options.timeout)
        : await queryPromise

      const duration = Date.now() - startTime

      // Track performance
      DatabasePerformanceTracker.trackSlowQuery(
        `${model}.findMany`,
        duration,
        JSON.stringify(query)
      )

      // Cache result if enabled
      if (useCache && result) {
        this.cache.set(cacheKey, [], result, options.cacheTTL)
        AppLogger.info('Query result cached', { model, duration, resultCount: Array.isArray(result) ? result.length : 1 })
      }

      return result

    } catch (error) {
      const duration = Date.now() - startTime
      
      AppLogger.error(`Database query failed: ${model}.findMany`, error as Error, {
        query,
        duration,
        model
      })
      
      throw error
    }
  }

  // Optimized aggregation queries
  async aggregateOptimized<T>(
    model: string,
    aggregation: any,
    options: {
      cache?: boolean
      cacheTTL?: number
      timeout?: number
    } = {}
  ): Promise<T> {
    const cacheKey = `${model}:aggregate:${JSON.stringify(aggregation)}`
    const useCache = options.cache !== false && this.config.enableCaching
    
    if (useCache) {
      const cached = this.cache.get(cacheKey)
      if (cached) {
        return cached
      }
    }

    return PerformanceTracker.measureAsync(
      `${model}.aggregate`,
      async () => {
        const queryPromise = (this.prisma as any)[model].aggregate(aggregation)
        
        const result = options.timeout 
          ? await this.withTimeout(queryPromise, options.timeout)
          : await queryPromise

        if (useCache && result) {
          this.cache.set(cacheKey, [], result, options.cacheTTL)
        }

        return result
      },
      'database',
      { model, operation: 'aggregate' }
    )
  }

  // Batch operations for better performance
  async batchCreate<T>(
    model: string,
    data: any[],
    batchSize = 100
  ): Promise<T[]> {
    const results: T[] = []
    
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize)
      
      const batchResult = await PerformanceTracker.measureAsync(
        `${model}.createMany`,
        async () => {
          return (this.prisma as any)[model].createMany({
            data: batch,
            skipDuplicates: true
          })
        },
        'database',
        { model, batchSize: batch.length }
      )
      
      results.push(batchResult)
      
      // Small delay to prevent overwhelming the database
      if (i + batchSize < data.length) {
        await new Promise(resolve => setTimeout(resolve, 10))
      }
    }
    
    return results
  }

  // Optimized pagination
  async paginateOptimized<T>(
    model: string,
    query: any,
    page: number,
    limit: number,
    options: {
      cache?: boolean
      orderBy?: any
      cursor?: any
    } = {}
  ): Promise<{
    data: T[]
    total: number
    page: number
    limit: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }> {
    const offset = (page - 1) * limit
    
    // Use cursor-based pagination for better performance on large datasets
    if (options.cursor) {
      return this.cursorPaginate<T>(model, query, options.cursor, limit, options)
    }

    // Traditional offset pagination with optimizations
    const [data, total] = await Promise.all([
      this.findOptimized<T[]>(model, {
        ...query,
        skip: offset,
        take: limit,
        orderBy: options.orderBy || { id: 'asc' }
      }, { cache: options.cache }),
      
      this.aggregateOptimized<{ _count: number }>(model, {
        where: query.where,
        _count: true
      }, { cache: options.cache, cacheTTL: 60 }) // Cache count for 1 minute
    ])

    const totalPages = Math.ceil(total._count / limit)

    return {
      data,
      total: total._count,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  }

  // Cursor-based pagination for large datasets
  private async cursorPaginate<T>(
    model: string,
    query: any,
    cursor: any,
    limit: number,
    options: any
  ): Promise<any> {
    const data = await this.findOptimized<T[]>(model, {
      ...query,
      take: limit + 1, // Take one extra to check if there's a next page
      cursor,
      orderBy: options.orderBy || { id: 'asc' }
    }, { cache: options.cache })

    const hasNext = data.length > limit
    if (hasNext) {
      data.pop() // Remove the extra item
    }

    const nextCursor = hasNext && data.length > 0 ? 
      { id: (data[data.length - 1] as any).id } : null

    return {
      data,
      cursor: nextCursor,
      hasNext,
      limit
    }
  }

  // Query timeout utility
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
    })

    return Promise.race([promise, timeoutPromise])
  }

  // Query analysis and suggestions
  async analyzeQuery(model: string, query: any): Promise<{
    suggestions: string[]
    estimatedCost: 'low' | 'medium' | 'high'
    requiredIndexes: string[]
    optimizations: string[]
  }> {
    const suggestions: string[] = []
    const requiredIndexes: string[] = []
    const optimizations: string[] = []
    
    // Analyze WHERE clause
    if (query.where) {
      const whereFields = Object.keys(query.where)
      
      // Check for missing indexes
      whereFields.forEach(field => {
        if (!['id', 'createdAt', 'updatedAt'].includes(field)) {
          requiredIndexes.push(`${model}.${field}`)
          suggestions.push(`Consider adding an index on ${model}.${field}`)
        }
      })

      // Check for inefficient operations
      if (query.where.OR && Array.isArray(query.where.OR)) {
        suggestions.push('OR queries can be slow - consider restructuring if possible')
      }

      if (query.where.NOT) {
        suggestions.push('NOT queries can be inefficient - consider positive matching instead')
      }
    }

    // Analyze SELECT clause
    if (query.select && Object.keys(query.select).length < 5) {
      optimizations.push('Using SELECT for specific fields - good for performance')
    } else if (!query.select) {
      suggestions.push('Consider using SELECT to fetch only required fields')
    }

    // Analyze ordering
    if (query.orderBy && !query.where) {
      suggestions.push('Ordering without WHERE clause may be slow on large tables')
    }

    // Analyze pagination
    if (query.skip && query.skip > 10000) {
      suggestions.push('Large OFFSET values are inefficient - consider cursor-based pagination')
    }

    // Estimate query cost
    let estimatedCost: 'low' | 'medium' | 'high' = 'low'
    
    if (query.skip > 1000 || (query.where?.OR && query.where.OR.length > 5)) {
      estimatedCost = 'high'
    } else if (query.include || query.skip > 100) {
      estimatedCost = 'medium'
    }

    return {
      suggestions,
      estimatedCost,
      requiredIndexes,
      optimizations
    }
  }

  // Cache management
  clearCache(): void {
    this.cache.clear()
    AppLogger.info('Query cache cleared')
  }

  getCacheStats() {
    return this.cache.getStats()
  }
}

// Database health monitoring
export class DatabaseHealthMonitor {
  private prisma: PrismaClient
  private metrics: {
    queryCount: number
    slowQueries: number
    errors: number
    avgResponseTime: number
    connectionCount: number
  } = {
    queryCount: 0,
    slowQueries: 0,
    errors: 0,
    avgResponseTime: 0,
    connectionCount: 0
  }

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
  }

  async checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    checks: {
      connection: boolean
      queryPerformance: boolean
      memoryUsage: boolean
    }
    metrics: {
      queryCount: number
      slowQueries: number
      errors: number
      avgResponseTime: number
      connectionCount: number
    }
    recommendations: string[]
  }> {
    const checks = {
      connection: await this.checkConnection(),
      queryPerformance: await this.checkQueryPerformance(),
      memoryUsage: await this.checkMemoryUsage()
    }

    const failedChecks = Object.values(checks).filter(check => !check).length
    
    let status: 'healthy' | 'degraded' | 'unhealthy'
    if (failedChecks === 0) status = 'healthy'
    else if (failedChecks === 1) status = 'degraded'
    else status = 'unhealthy'

    const recommendations = this.generateRecommendations(checks)

    return {
      status,
      checks,
      metrics: { ...this.metrics },
      recommendations
    }
  }

  private async checkConnection(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return true
    } catch (error) {
      AppLogger.error('Database connection check failed', error as Error)
      return false
    }
  }

  private async checkQueryPerformance(): Promise<boolean> {
    // Check if average response time is acceptable
    return this.metrics.avgResponseTime < 500 && 
           (this.metrics.slowQueries / Math.max(1, this.metrics.queryCount)) < 0.1
  }

  private async checkMemoryUsage(): Promise<boolean> {
    const memUsage = process.memoryUsage()
    const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100
    return heapUsagePercent < 90
  }

  private generateRecommendations(checks: any): string[] {
    const recommendations: string[] = []

    if (!checks.connection) {
      recommendations.push('Database connection is failing - check connection string and database availability')
    }

    if (!checks.queryPerformance) {
      recommendations.push('Query performance is degraded - consider optimizing slow queries and adding indexes')
    }

    if (!checks.memoryUsage) {
      recommendations.push('Memory usage is high - consider increasing heap size or optimizing memory usage')
    }

    if (this.metrics.slowQueries > 10) {
      recommendations.push('High number of slow queries detected - review and optimize database queries')
    }

    return recommendations
  }

  updateMetrics(duration: number, isError = false): void {
    this.metrics.queryCount++
    this.metrics.avgResponseTime = (this.metrics.avgResponseTime + duration) / 2
    
    if (duration > 1000) {
      this.metrics.slowQueries++
    }
    
    if (isError) {
      this.metrics.errors++
    }
  }
}

// Export optimized database utilities
export { OptimizedQueryBuilder, QueryCache, ConnectionPoolManager }

// Global instances (to be initialized with actual Prisma client)
let optimizedQueryBuilder: OptimizedQueryBuilder | null = null
let databaseHealthMonitor: DatabaseHealthMonitor | null = null

export function initializeDatabaseOptimization(prisma: PrismaClient, config?: Partial<QueryOptimizationConfig>) {
  optimizedQueryBuilder = new OptimizedQueryBuilder(prisma, config)
  databaseHealthMonitor = new DatabaseHealthMonitor(prisma)
  
  AppLogger.info('Database optimization initialized', { config })
}

export function getOptimizedQueryBuilder(): OptimizedQueryBuilder {
  if (!optimizedQueryBuilder) {
    throw new Error('Database optimization not initialized')
  }
  return optimizedQueryBuilder
}

export function getDatabaseHealthMonitor(): DatabaseHealthMonitor {
  if (!databaseHealthMonitor) {
    throw new Error('Database health monitor not initialized')
  }
  return databaseHealthMonitor
}