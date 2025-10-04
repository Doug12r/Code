import { NextRequest } from 'next/server'

// Enhanced audit logging system
export interface AuditEvent {
  id: string
  timestamp: string
  eventType: 'security' | 'access' | 'data' | 'admin' | 'system'
  action: string
  userId?: string
  sessionId?: string
  ipAddress?: string
  userAgent?: string
  resource?: string
  details: Record<string, any>
  severity: 'info' | 'warning' | 'error' | 'critical'
  success: boolean
}

export interface SecurityMetrics {
  requestCount: number
  errorCount: number
  suspiciousActivity: number
  rateLimitHits: number
  authFailures: number
  lastUpdated: string
}

class AuditLogger {
  private static instance: AuditLogger
  private events: AuditEvent[] = []
  private maxEvents = 10000
  private metrics: SecurityMetrics = {
    requestCount: 0,
    errorCount: 0,
    suspiciousActivity: 0,
    rateLimitHits: 0,
    authFailures: 0,
    lastUpdated: new Date().toISOString()
  }

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger()
    }
    return AuditLogger.instance
  }

  async logEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const auditEvent: AuditEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...event
    }

    // Add to in-memory store
    this.events.unshift(auditEvent)
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents)
    }

    // Update metrics
    this.updateMetrics(auditEvent)

    // Log to console based on severity
    if (auditEvent.severity === 'critical' || auditEvent.severity === 'error') {
      console.error('AUDIT EVENT:', auditEvent)
    } else if (auditEvent.severity === 'warning') {
      console.warn('Audit Event:', auditEvent)
    } else {
      console.log('Audit Event:', auditEvent)
    }

    // In production, persist to database
    await this.persistEvent(auditEvent)
  }

  private updateMetrics(event: AuditEvent): void {
    if (event.eventType === 'security') {
      if (event.action.includes('rate_limit')) {
        this.metrics.rateLimitHits++
      }
      if (event.action.includes('auth_failure')) {
        this.metrics.authFailures++
      }
      if (event.action.includes('suspicious')) {
        this.metrics.suspiciousActivity++
      }
    }

    this.metrics.requestCount++
    
    if (!event.success || event.severity === 'error' || event.severity === 'critical') {
      this.metrics.errorCount++
    }

    this.metrics.lastUpdated = new Date().toISOString()
  }

  private async persistEvent(event: AuditEvent): Promise<void> {
    try {
      // In production, store in database
      // await prisma.auditLog.create({ data: event })
      
      // For development, could write to file or external service
      if (process.env.NODE_ENV === 'development') {
        // Could implement file logging here
      }
    } catch (error) {
      console.error('Failed to persist audit event:', error)
    }
  }

  getEvents(filters?: {
    eventType?: string
    userId?: string
    severity?: string
    startDate?: string
    endDate?: string
    limit?: number
  }): AuditEvent[] {
    let filteredEvents = [...this.events]

    if (filters) {
      if (filters.eventType) {
        filteredEvents = filteredEvents.filter(e => e.eventType === filters.eventType)
      }
      if (filters.userId) {
        filteredEvents = filteredEvents.filter(e => e.userId === filters.userId)
      }
      if (filters.severity) {
        filteredEvents = filteredEvents.filter(e => e.severity === filters.severity)
      }
      if (filters.startDate) {
        filteredEvents = filteredEvents.filter(e => e.timestamp >= filters.startDate!)
      }
      if (filters.endDate) {
        filteredEvents = filteredEvents.filter(e => e.timestamp <= filters.endDate!)
      }
      if (filters.limit) {
        filteredEvents = filteredEvents.slice(0, filters.limit)
      }
    }

    return filteredEvents
  }

  getMetrics(): SecurityMetrics {
    return { ...this.metrics }
  }

  clearEvents(): void {
    this.events = []
    this.metrics = {
      requestCount: 0,
      errorCount: 0,
      suspiciousActivity: 0,
      rateLimitHits: 0,
      authFailures: 0,
      lastUpdated: new Date().toISOString()
    }
  }
}

// Singleton instance
export const auditLogger = AuditLogger.getInstance()

// Convenience functions for common audit events
export class AuditEvents {
  static async logSecurityEvent(
    action: string,
    req: NextRequest,
    details: Record<string, any> = {},
    severity: AuditEvent['severity'] = 'warning',
    success = false
  ) {
    await auditLogger.logEvent({
      eventType: 'security',
      action,
      ipAddress: req.headers.get('x-forwarded-for') || 
                 req.headers.get('x-real-ip') || 
                 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
      resource: req.nextUrl.pathname,
      details,
      severity,
      success
    })
  }

  static async logAccessEvent(
    action: string,
    userId: string,
    sessionId: string,
    req: NextRequest,
    success = true,
    details: Record<string, any> = {}
  ) {
    await auditLogger.logEvent({
      eventType: 'access',
      action,
      userId,
      sessionId,
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
      resource: req.nextUrl.pathname,
      details,
      severity: success ? 'info' : 'warning',
      success
    })
  }

  static async logDataEvent(
    action: string,
    userId: string,
    resource: string,
    details: Record<string, any> = {},
    success = true
  ) {
    await auditLogger.logEvent({
      eventType: 'data',
      action,
      userId,
      resource,
      details,
      severity: success ? 'info' : 'error',
      success
    })
  }

  static async logAdminEvent(
    action: string,
    userId: string,
    details: Record<string, any> = {},
    severity: AuditEvent['severity'] = 'warning'
  ) {
    await auditLogger.logEvent({
      eventType: 'admin',
      action,
      userId,
      details,
      severity,
      success: true
    })
  }

  static async logSystemEvent(
    action: string,
    details: Record<string, any> = {},
    severity: AuditEvent['severity'] = 'info',
    success = true
  ) {
    await auditLogger.logEvent({
      eventType: 'system',
      action,
      details,
      severity,
      success
    })
  }
}

// Performance monitoring
export interface PerformanceMetrics {
  averageResponseTime: number
  requestsPerMinute: number
  errorRate: number
  slowQueries: number
  memoryUsage: number
  cpuUsage: number
  lastUpdated: string
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor
  private metrics: PerformanceMetrics = {
    averageResponseTime: 0,
    requestsPerMinute: 0,
    errorRate: 0,
    slowQueries: 0,
    memoryUsage: 0,
    cpuUsage: 0,
    lastUpdated: new Date().toISOString()
  }
  
  private responseTimes: number[] = []
  private requestTimestamps: number[] = []
  private errorCount = 0
  private totalRequests = 0

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor()
    }
    return PerformanceMonitor.instance
  }

  recordRequest(responseTime: number, isError = false): void {
    const now = Date.now()
    
    // Record response time
    this.responseTimes.push(responseTime)
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000)
    }

    // Record request timestamp for RPM calculation
    this.requestTimestamps.push(now)
    const oneMinuteAgo = now - 60000
    this.requestTimestamps = this.requestTimestamps.filter(t => t > oneMinuteAgo)

    // Update counters
    this.totalRequests++
    if (isError) {
      this.errorCount++
    }

    // Log slow queries
    if (responseTime > 5000) { // 5 seconds
      this.metrics.slowQueries++
      AuditEvents.logSystemEvent('slow_query', {
        responseTime,
        threshold: 5000
      }, 'warning', false)
    }

    this.updateMetrics()
  }

  private updateMetrics(): void {
    // Calculate average response time
    if (this.responseTimes.length > 0) {
      this.metrics.averageResponseTime = 
        this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length
    }

    // Calculate requests per minute
    this.metrics.requestsPerMinute = this.requestTimestamps.length

    // Calculate error rate
    this.metrics.errorRate = this.totalRequests > 0 ? 
      (this.errorCount / this.totalRequests) * 100 : 0

    // Get system metrics
    try {
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const memUsage = process.memoryUsage()
        this.metrics.memoryUsage = memUsage.heapUsed / 1024 / 1024 // MB
      }
      
      // CPU usage would require additional monitoring
      this.metrics.cpuUsage = 0
    } catch (error) {
      // Ignore errors in browser environment
    }

    this.metrics.lastUpdated = new Date().toISOString()
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics }
  }

  reset(): void {
    this.responseTimes = []
    this.requestTimestamps = []
    this.errorCount = 0
    this.totalRequests = 0
    this.metrics = {
      averageResponseTime: 0,
      requestsPerMinute: 0,
      errorRate: 0,
      slowQueries: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      lastUpdated: new Date().toISOString()
    }
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance()

// Health check system
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  checks: {
    database: 'up' | 'down' | 'slow'
    redis: 'up' | 'down' | 'slow'
    external_apis: 'up' | 'down' | 'slow'
    memory: 'ok' | 'high' | 'critical'
    disk: 'ok' | 'high' | 'critical'
  }
  uptime: number
  lastCheck: string
}

export class HealthChecker {
  private static startTime = Date.now()

  static async getHealthStatus(): Promise<HealthStatus> {
    const checks = await this.performHealthChecks()
    
    const failedChecks = Object.values(checks).filter(
      status => status === 'down' || status === 'critical'
    ).length
    
    const slowChecks = Object.values(checks).filter(
      status => status === 'slow' || status === 'high'
    ).length

    let overallStatus: HealthStatus['status'] = 'healthy'
    if (failedChecks > 0) {
      overallStatus = 'unhealthy'
    } else if (slowChecks > 0) {
      overallStatus = 'degraded'
    }

    return {
      status: overallStatus,
      checks,
      uptime: Date.now() - this.startTime,
      lastCheck: new Date().toISOString()
    }
  }

  private static async performHealthChecks(): Promise<HealthStatus['checks']> {
    const checks: HealthStatus['checks'] = {
      database: 'up',
      redis: 'up',
      external_apis: 'up',
      memory: 'ok',
      disk: 'ok'
    }

    // Database check
    try {
      // In production: await prisma.$queryRaw`SELECT 1`
      // For now, assume healthy
      checks.database = 'up'
    } catch (error) {
      checks.database = 'down'
    }

    // Redis check
    try {
      // In production: await redis.ping()
      checks.redis = 'up'
    } catch (error) {
      checks.redis = 'down'
    }

    // External APIs (Plex) check
    try {
      // Could ping Plex API health endpoint
      checks.external_apis = 'up'
    } catch (error) {
      checks.external_apis = 'down'
    }

    // Memory check
    try {
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const memUsage = process.memoryUsage()
        const heapUsedMB = memUsage.heapUsed / 1024 / 1024
        
        if (heapUsedMB > 1000) { // 1GB
          checks.memory = 'critical'
        } else if (heapUsedMB > 500) { // 500MB
          checks.memory = 'high'
        }
      }
    } catch (error) {
      // Ignore in browser environment
    }

    // Disk check would require additional monitoring
    checks.disk = 'ok'

    return checks
  }
}