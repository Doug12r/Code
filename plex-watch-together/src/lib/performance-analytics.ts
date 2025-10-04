import { NextRequest } from 'next/server'
import { AppLogger } from './structured-logging'

// Performance metric types
export interface PerformanceMetric {
  id: string
  timestamp: number
  type: 'api' | 'database' | 'cache' | 'render' | 'network' | 'custom'
  name: string
  duration: number
  success: boolean
  metadata: Record<string, any>
}

export interface SystemMetrics {
  cpu: {
    usage: number
    cores: number
    model: string
  }
  memory: {
    used: number
    total: number
    percentage: number
    heapUsed: number
    heapTotal: number
  }
  network: {
    bytesIn: number
    bytesOut: number
    connectionsActive: number
  }
  disk: {
    used: number
    total: number
    percentage: number
    iops: number
  }
}

export interface DatabaseMetrics {
  queries: {
    total: number
    slow: number
    failed: number
    avgDuration: number
  }
  connections: {
    active: number
    idle: number
    max: number
  }
  cache: {
    hits: number
    misses: number
    hitRate: number
    size: number
  }
}

export interface ApplicationMetrics {
  requests: {
    total: number
    successful: number
    failed: number
    avgResponseTime: number
  }
  errors: {
    total: number
    rate: number
    byType: Record<string, number>
  }
  users: {
    active: number
    authenticated: number
    concurrent: number
  }
  rooms: {
    active: number
    totalMembers: number
    avgMembersPerRoom: number
  }
}

// Performance monitoring class
class PerformanceMonitor {
  private static instance: PerformanceMonitor
  private metrics: PerformanceMetric[] = []
  private maxMetrics = 10000
  private collectors: Map<string, () => any> = new Map()
  private intervals: Map<string, NodeJS.Timeout> = new Map()

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor()
    }
    return PerformanceMonitor.instance
  }

  constructor() {
    this.initializeCollectors()
  }

  private initializeCollectors(): void {
    // System metrics collector
    this.addCollector('system', () => this.collectSystemMetrics(), 5000)
    
    // Database metrics collector
    this.addCollector('database', () => this.collectDatabaseMetrics(), 10000)
    
    // Application metrics collector
    this.addCollector('application', () => this.collectApplicationMetrics(), 5000)
  }

  addCollector(name: string, collector: () => any, intervalMs: number): void {
    this.collectors.set(name, collector)
    
    const interval = setInterval(() => {
      try {
        const data = collector()
        AppLogger.info(`Metrics collected: ${name}`, { collector: name, data })
      } catch (error) {
        AppLogger.error(`Metrics collection failed: ${name}`, error as Error, { collector: name })
      }
    }, intervalMs)
    
    this.intervals.set(name, interval)
  }

  removeCollector(name: string): void {
    const interval = this.intervals.get(name)
    if (interval) {
      clearInterval(interval)
      this.intervals.delete(name)
    }
    this.collectors.delete(name)
  }

  private collectSystemMetrics(): SystemMetrics {
    const memUsage = process.memoryUsage()
    
    return {
      cpu: {
        usage: this.getCPUUsage(),
        cores: require('os').cpus().length,
        model: require('os').cpus()[0]?.model || 'Unknown'
      },
      memory: {
        used: memUsage.rss,
        total: require('os').totalmem(),
        percentage: (memUsage.rss / require('os').totalmem()) * 100,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal
      },
      network: {
        bytesIn: 0, // Would need external monitoring
        bytesOut: 0,
        connectionsActive: 0
      },
      disk: {
        used: 0, // Would need external monitoring
        total: 0,
        percentage: 0,
        iops: 0
      }
    }
  }

  private getCPUUsage(): number {
    const startUsage = process.cpuUsage()
    const startTime = Date.now()
    
    // Simple CPU usage calculation
    setTimeout(() => {
      const endUsage = process.cpuUsage(startUsage)
      const endTime = Date.now()
      
      const userCPU = endUsage.user / 1000 // Convert to milliseconds
      const systemCPU = endUsage.system / 1000
      const totalTime = endTime - startTime
      
      return ((userCPU + systemCPU) / totalTime) * 100
    }, 100)
    
    return 0 // Placeholder for sync method
  }

  private collectDatabaseMetrics(): DatabaseMetrics {
    // In production, collect from actual database
    return {
      queries: {
        total: 0,
        slow: 0,
        failed: 0,
        avgDuration: 0
      },
      connections: {
        active: 0,
        idle: 0,
        max: 10
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0,
        size: 0
      }
    }
  }

  private collectApplicationMetrics(): ApplicationMetrics {
    // Calculate from stored metrics
    const recentMetrics = this.getRecentMetrics(60000) // Last minute
    
    const requests = recentMetrics.filter(m => m.type === 'api')
    const errors = recentMetrics.filter(m => !m.success)
    
    return {
      requests: {
        total: requests.length,
        successful: requests.filter(r => r.success).length,
        failed: requests.filter(r => !r.success).length,
        avgResponseTime: requests.reduce((sum, r) => sum + r.duration, 0) / requests.length || 0
      },
      errors: {
        total: errors.length,
        rate: (errors.length / recentMetrics.length) * 100 || 0,
        byType: errors.reduce((acc, error) => {
          const type = error.metadata.errorType || 'unknown'
          acc[type] = (acc[type] || 0) + 1
          return acc
        }, {} as Record<string, number>)
      },
      users: {
        active: 0, // Would track from session data
        authenticated: 0,
        concurrent: 0
      },
      rooms: {
        active: 0, // Would track from socket connections
        totalMembers: 0,
        avgMembersPerRoom: 0
      }
    }
  }

  recordMetric(metric: Omit<PerformanceMetric, 'id' | 'timestamp'>): string {
    const fullMetric: PerformanceMetric = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...metric
    }

    this.metrics.push(fullMetric)

    // Maintain max metrics limit
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics)
    }

    // Log slow operations
    if (fullMetric.duration > 1000) {
      AppLogger.warn(`Slow operation detected: ${fullMetric.name}`, {
        duration: fullMetric.duration,
        type: fullMetric.type,
        metadata: fullMetric.metadata
      })
    }

    return fullMetric.id
  }

  getMetrics(filters?: {
    type?: string
    name?: string
    timeRange?: number
    limit?: number
  }): PerformanceMetric[] {
    let filtered = [...this.metrics]

    if (filters) {
      if (filters.type) {
        filtered = filtered.filter(m => m.type === filters.type)
      }
      if (filters.name) {
        filtered = filtered.filter(m => m.name.includes(filters.name!))
      }
      if (filters.timeRange) {
        const since = Date.now() - filters.timeRange
        filtered = filtered.filter(m => m.timestamp >= since)
      }
      if (filters.limit) {
        filtered = filtered.slice(-filters.limit)
      }
    }

    return filtered.sort((a, b) => b.timestamp - a.timestamp)
  }

  getRecentMetrics(timeRangeMs: number): PerformanceMetric[] {
    const since = Date.now() - timeRangeMs
    return this.metrics.filter(m => m.timestamp >= since)
  }

  getAggregatedMetrics(timeRangeMs: number = 300000): {
    summary: {
      totalOperations: number
      avgDuration: number
      successRate: number
      errorRate: number
    }
    byType: Record<string, {
      count: number
      avgDuration: number
      successRate: number
    }>
    slowest: PerformanceMetric[]
    errors: PerformanceMetric[]
  } {
    const metrics = this.getRecentMetrics(timeRangeMs)
    
    const summary = {
      totalOperations: metrics.length,
      avgDuration: metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length || 0,
      successRate: (metrics.filter(m => m.success).length / metrics.length) * 100 || 0,
      errorRate: (metrics.filter(m => !m.success).length / metrics.length) * 100 || 0
    }

    const byType = metrics.reduce((acc, metric) => {
      if (!acc[metric.type]) {
        acc[metric.type] = { count: 0, totalDuration: 0, successes: 0 }
      }
      
      acc[metric.type].count++
      acc[metric.type].totalDuration += metric.duration
      if (metric.success) acc[metric.type].successes++
      
      return acc
    }, {} as Record<string, any>)

    // Calculate averages
    Object.keys(byType).forEach(type => {
      const data = byType[type]
      byType[type] = {
        count: data.count,
        avgDuration: data.totalDuration / data.count,
        successRate: (data.successes / data.count) * 100
      }
    })

    const slowest = metrics
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10)

    const errors = metrics
      .filter(m => !m.success)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20)

    return { summary, byType, slowest, errors }
  }

  clearMetrics(): void {
    this.metrics = []
  }

  shutdown(): void {
    this.intervals.forEach(interval => clearInterval(interval))
    this.intervals.clear()
    this.collectors.clear()
  }
}

// Singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance()

// Performance measurement decorators and utilities
export class PerformanceTracker {
  private static timers: Map<string, number> = new Map()

  static startTimer(name: string): string {
    const timerId = `${name}_${Date.now()}_${Math.random()}`
    this.timers.set(timerId, performance.now())
    return timerId
  }

  static endTimer(timerId: string, type: PerformanceMetric['type'] = 'custom', success = true, metadata: Record<string, any> = {}): number {
    const startTime = this.timers.get(timerId)
    if (!startTime) {
      throw new Error(`Timer ${timerId} not found`)
    }

    const duration = performance.now() - startTime
    this.timers.delete(timerId)

    const name = timerId.split('_')[0]
    performanceMonitor.recordMetric({
      type,
      name,
      duration,
      success,
      metadata
    })

    return duration
  }

  static measure<T>(
    name: string,
    fn: () => T | Promise<T>,
    type: PerformanceMetric['type'] = 'custom',
    metadata: Record<string, any> = {}
  ): Promise<T> {
    const timerId = this.startTimer(name)
    
    return Promise.resolve()
      .then(() => fn())
      .then(
        result => {
          this.endTimer(timerId, type, true, metadata)
          return result
        },
        error => {
          this.endTimer(timerId, type, false, { ...metadata, error: error.message })
          throw error
        }
      )
  }

  static async measureAsync<T>(
    name: string,
    fn: () => Promise<T>,
    type: PerformanceMetric['type'] = 'custom',
    metadata: Record<string, any> = {}
  ): Promise<T> {
    const timerId = this.startTimer(name)
    
    try {
      const result = await fn()
      this.endTimer(timerId, type, true, metadata)
      return result
    } catch (error) {
      this.endTimer(timerId, type, false, { ...metadata, error: (error as Error).message })
      throw error
    }
  }
}

// Request performance middleware
export function createPerformanceMiddleware() {
  return (req: NextRequest, startTime?: number) => {
    const requestStart = startTime || Date.now()
    const url = req.nextUrl.pathname
    const method = req.method

    return {
      end: (statusCode: number, error?: Error) => {
        const duration = Date.now() - requestStart
        const success = statusCode < 400 && !error

        performanceMonitor.recordMetric({
          type: 'api',
          name: `${method} ${url}`,
          duration,
          success,
          metadata: {
            method,
            url,
            statusCode,
            userAgent: req.headers.get('user-agent'),
            ip: req.headers.get('x-forwarded-for') || 'unknown',
            error: error ? {
              name: error.name,
              message: error.message
            } : undefined
          }
        })

        // Log performance
        AppLogger.performance(`${method} ${url}`, duration, {
          statusCode,
          success,
          error: error?.message
        })
      }
    }
  }
}

// Database query performance tracking
export class DatabasePerformanceTracker {
  static async trackQuery<T>(
    queryName: string,
    queryFn: () => Promise<T>,
    metadata: Record<string, any> = {}
  ): Promise<T> {
    return PerformanceTracker.measureAsync(
      `db_${queryName}`,
      queryFn,
      'database',
      { ...metadata, queryName }
    )
  }

  static trackSlowQuery(queryName: string, duration: number, sql?: string): void {
    if (duration > 1000) { // Slow query threshold: 1 second
      AppLogger.warn(`Slow database query detected: ${queryName}`, {
        queryName,
        duration,
        sql: sql?.slice(0, 200), // Truncate long SQL
        threshold: 1000
      })
    }
  }
}

// Cache performance tracking
export class CachePerformanceTracker {
  private static stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0
  }

  static recordHit(key: string, retrievalTime?: number): void {
    this.stats.hits++
    
    if (retrievalTime !== undefined) {
      performanceMonitor.recordMetric({
        type: 'cache',
        name: 'cache_hit',
        duration: retrievalTime,
        success: true,
        metadata: { key: key.slice(0, 50) } // Truncate long keys
      })
    }
  }

  static recordMiss(key: string): void {
    this.stats.misses++
    
    performanceMonitor.recordMetric({
      type: 'cache',
      name: 'cache_miss',
      duration: 0,
      success: false,
      metadata: { key: key.slice(0, 50) }
    })
  }

  static recordSet(key: string, setTime: number): void {
    this.stats.sets++
    
    performanceMonitor.recordMetric({
      type: 'cache',
      name: 'cache_set',
      duration: setTime,
      success: true,
      metadata: { key: key.slice(0, 50) }
    })
  }

  static getStats(): typeof CachePerformanceTracker.stats & { hitRate: number } {
    const total = this.stats.hits + this.stats.misses
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0
    
    return {
      ...this.stats,
      hitRate
    }
  }

  static resetStats(): void {
    this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0 }
  }
}

// Web Vitals tracking for client-side performance
export class WebVitalsTracker {
  static trackCLS(value: number): void {
    performanceMonitor.recordMetric({
      type: 'render',
      name: 'cumulative_layout_shift',
      duration: value,
      success: value < 0.1, // Good CLS threshold
      metadata: { metric: 'CLS', value, threshold: 0.1 }
    })
  }

  static trackFID(value: number): void {
    performanceMonitor.recordMetric({
      type: 'render',
      name: 'first_input_delay',
      duration: value,
      success: value < 100, // Good FID threshold (ms)
      metadata: { metric: 'FID', value, threshold: 100 }
    })
  }

  static trackLCP(value: number): void {
    performanceMonitor.recordMetric({
      type: 'render',
      name: 'largest_contentful_paint',
      duration: value,
      success: value < 2500, // Good LCP threshold (ms)
      metadata: { metric: 'LCP', value, threshold: 2500 }
    })
  }

  static trackFCP(value: number): void {
    performanceMonitor.recordMetric({
      type: 'render',
      name: 'first_contentful_paint',
      duration: value,
      success: value < 1800, // Good FCP threshold (ms)
      metadata: { metric: 'FCP', value, threshold: 1800 }
    })
  }

  static trackTTFB(value: number): void {
    performanceMonitor.recordMetric({
      type: 'network',
      name: 'time_to_first_byte',
      duration: value,
      success: value < 800, // Good TTFB threshold (ms)
      metadata: { metric: 'TTFB', value, threshold: 800 }
    })
  }
}

// Cleanup on process termination
process.on('SIGTERM', () => {
  performanceMonitor.shutdown()
})

process.on('SIGINT', () => {
  performanceMonitor.shutdown()
})