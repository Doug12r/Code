import { NextRequest } from 'next/server'

// Log levels with severity ordering
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

// Log entry structure
export interface LogEntry {
  id: string
  timestamp: string
  level: LogLevel
  message: string
  category: string
  userId?: string
  sessionId?: string
  requestId?: string
  ipAddress?: string
  userAgent?: string
  url?: string
  method?: string
  statusCode?: number
  responseTime?: number
  error?: {
    name: string
    message: string
    stack?: string
    cause?: any
  }
  metadata: Record<string, any>
  environment: 'development' | 'staging' | 'production'
}

// Logger configuration
interface LoggerConfig {
  level: LogLevel
  enableConsole: boolean
  enableFile: boolean
  enableRemote: boolean
  remoteEndpoint?: string
  maxBufferSize: number
  flushInterval: number
  categories: string[]
  includeStack: boolean
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  enableConsole: true,
  enableFile: process.env.NODE_ENV === 'production',
  enableRemote: process.env.NODE_ENV === 'production',
  remoteEndpoint: process.env.LOG_ENDPOINT,
  maxBufferSize: 1000,
  flushInterval: 5000,
  categories: ['app', 'auth', 'plex', 'sync', 'performance', 'security', 'error'],
  includeStack: process.env.NODE_ENV !== 'production'
}

// Structured logger implementation
class StructuredLogger {
  private static instance: StructuredLogger
  private config: LoggerConfig
  private buffer: LogEntry[] = []
  private flushTimer: NodeJS.Timeout | null = null

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.startFlushTimer()
  }

  static getInstance(config?: Partial<LoggerConfig>): StructuredLogger {
    if (!StructuredLogger.instance) {
      StructuredLogger.instance = new StructuredLogger(config)
    }
    return StructuredLogger.instance
  }

  private startFlushTimer(): void {
    if (this.flushTimer) return

    this.flushTimer = setInterval(() => {
      this.flush()
    }, this.config.flushInterval)
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level
  }

  private generateId(): string {
    return crypto.randomUUID()
  }

  private formatMessage(level: LogLevel, message: string): string {
    const levelName = LogLevel[level]
    const timestamp = new Date().toISOString()
    return `[${timestamp}] ${levelName}: ${message}`
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    category: string,
    metadata: Record<string, any> = {},
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      level,
      message,
      category,
      metadata,
      environment: process.env.NODE_ENV as any || 'development'
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: this.config.includeStack ? error.stack : undefined,
        cause: error.cause
      }
    }

    return entry
  }

  private addToBuffer(entry: LogEntry): void {
    this.buffer.push(entry)

    if (this.buffer.length >= this.config.maxBufferSize) {
      this.flush()
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return

    const entries = [...this.buffer]
    this.buffer = []

    // Console logging
    if (this.config.enableConsole) {
      entries.forEach(entry => {
        const formatted = this.formatMessage(entry.level, entry.message)
        
        if (entry.level >= LogLevel.ERROR) {
          console.error(formatted, entry)
        } else if (entry.level >= LogLevel.WARN) {
          console.warn(formatted, entry)
        } else {
          console.log(formatted, entry)
        }
      })
    }

    // File logging (in production)
    if (this.config.enableFile) {
      await this.writeToFile(entries)
    }

    // Remote logging
    if (this.config.enableRemote && this.config.remoteEndpoint) {
      await this.sendToRemote(entries)
    }
  }

  private async writeToFile(entries: LogEntry[]): Promise<void> {
    try {
      // In production, implement file writing
      // const fs = require('fs').promises
      // const logFile = `logs/${new Date().toISOString().split('T')[0]}.log`
      // const logLines = entries.map(entry => JSON.stringify(entry)).join('\n')
      // await fs.appendFile(logFile, logLines + '\n')
    } catch (error) {
      console.error('Failed to write logs to file:', error)
    }
  }

  private async sendToRemote(entries: LogEntry[]): Promise<void> {
    try {
      if (!this.config.remoteEndpoint) return

      const response = await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.LOG_API_KEY}`
        },
        body: JSON.stringify({ entries })
      })

      if (!response.ok) {
        console.error('Failed to send logs to remote endpoint:', response.statusText)
      }
    } catch (error) {
      console.error('Error sending logs to remote:', error)
    }
  }

  // Core logging methods
  debug(message: string, category = 'app', metadata: Record<string, any> = {}): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return
    
    const entry = this.createLogEntry(LogLevel.DEBUG, message, category, metadata)
    this.addToBuffer(entry)
  }

  info(message: string, category = 'app', metadata: Record<string, any> = {}): void {
    if (!this.shouldLog(LogLevel.INFO)) return
    
    const entry = this.createLogEntry(LogLevel.INFO, message, category, metadata)
    this.addToBuffer(entry)
  }

  warn(message: string, category = 'app', metadata: Record<string, any> = {}): void {
    if (!this.shouldLog(LogLevel.WARN)) return
    
    const entry = this.createLogEntry(LogLevel.WARN, message, category, metadata)
    this.addToBuffer(entry)
  }

  error(message: string, error?: Error, category = 'error', metadata: Record<string, any> = {}): void {
    if (!this.shouldLog(LogLevel.ERROR)) return
    
    const entry = this.createLogEntry(LogLevel.ERROR, message, category, metadata, error)
    this.addToBuffer(entry)
  }

  critical(message: string, error?: Error, category = 'error', metadata: Record<string, any> = {}): void {
    const entry = this.createLogEntry(LogLevel.CRITICAL, message, category, metadata, error)
    this.addToBuffer(entry)
    
    // Immediately flush critical logs
    this.flush()
  }

  // Request logging with context
  logRequest(
    req: NextRequest,
    responseTime?: number,
    statusCode?: number,
    userId?: string,
    sessionId?: string
  ): void {
    const metadata = {
      url: req.nextUrl.pathname,
      method: req.method,
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent'),
      responseTime,
      statusCode,
      userId,
      sessionId
    }

    const level = statusCode && statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO
    const message = `${req.method} ${req.nextUrl.pathname} - ${statusCode || 'pending'}`
    
    const entry = this.createLogEntry(level, message, 'request', metadata)
    this.addToBuffer(entry)
  }

  // Performance logging
  logPerformance(
    operation: string,
    duration: number,
    metadata: Record<string, any> = {}
  ): void {
    const level = duration > 1000 ? LogLevel.WARN : LogLevel.INFO
    const message = `${operation} completed in ${duration}ms`
    
    const entry = this.createLogEntry(level, message, 'performance', {
      ...metadata,
      operation,
      duration
    })
    this.addToBuffer(entry)
  }

  // Security event logging
  logSecurity(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    metadata: Record<string, any> = {}
  ): void {
    const levelMap = {
      low: LogLevel.INFO,
      medium: LogLevel.WARN,
      high: LogLevel.ERROR,
      critical: LogLevel.CRITICAL
    }

    const entry = this.createLogEntry(
      levelMap[severity],
      `Security event: ${event}`,
      'security',
      { ...metadata, severity, event }
    )
    this.addToBuffer(entry)
  }

  // Business logic logging
  logBusiness(
    action: string,
    userId: string,
    metadata: Record<string, any> = {}
  ): void {
    const entry = this.createLogEntry(
      LogLevel.INFO,
      `Business action: ${action}`,
      'business',
      { ...metadata, action, userId }
    )
    this.addToBuffer(entry)
  }

  // Search and filter logs
  getLogs(filters?: {
    level?: LogLevel
    category?: string
    userId?: string
    startDate?: string
    endDate?: string
    limit?: number
  }): LogEntry[] {
    let filteredLogs = [...this.buffer]

    if (filters) {
      if (filters.level !== undefined) {
        filteredLogs = filteredLogs.filter(log => log.level >= filters.level!)
      }
      if (filters.category) {
        filteredLogs = filteredLogs.filter(log => log.category === filters.category)
      }
      if (filters.userId) {
        filteredLogs = filteredLogs.filter(log => log.userId === filters.userId)
      }
      if (filters.startDate) {
        filteredLogs = filteredLogs.filter(log => log.timestamp >= filters.startDate!)
      }
      if (filters.endDate) {
        filteredLogs = filteredLogs.filter(log => log.timestamp <= filters.endDate!)
      }
      if (filters.limit) {
        filteredLogs = filteredLogs.slice(0, filters.limit)
      }
    }

    return filteredLogs
  }

  // Get log statistics
  getStats(): {
    totalLogs: number
    logsByLevel: Record<string, number>
    logsByCategory: Record<string, number>
    recentErrors: number
  } {
    const stats = {
      totalLogs: this.buffer.length,
      logsByLevel: {} as Record<string, number>,
      logsByCategory: {} as Record<string, number>,
      recentErrors: 0
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    this.buffer.forEach(log => {
      // Count by level
      const levelName = LogLevel[log.level]
      stats.logsByLevel[levelName] = (stats.logsByLevel[levelName] || 0) + 1

      // Count by category
      stats.logsByCategory[log.category] = (stats.logsByCategory[log.category] || 0) + 1

      // Count recent errors
      if (log.level >= LogLevel.ERROR && log.timestamp >= oneHourAgo) {
        stats.recentErrors++
      }
    })

    return stats
  }

  // Cleanup and shutdown
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    await this.flush()
  }
}

// Singleton logger instance
export const logger = StructuredLogger.getInstance()

// Convenience functions for common logging patterns
export class AppLogger {
  static debug(message: string, metadata?: Record<string, any>): void {
    logger.debug(message, 'app', metadata)
  }

  static info(message: string, metadata?: Record<string, any>): void {
    logger.info(message, 'app', metadata)
  }

  static warn(message: string, metadata?: Record<string, any>): void {
    logger.warn(message, 'app', metadata)
  }

  static error(message: string, error?: Error, metadata?: Record<string, any>): void {
    logger.error(message, error, 'error', metadata)
  }

  static auth(message: string, userId?: string, metadata?: Record<string, any>): void {
    logger.info(message, 'auth', { ...metadata, userId })
  }

  static plex(message: string, metadata?: Record<string, any>): void {
    logger.info(message, 'plex', metadata)
  }

  static sync(message: string, roomId?: string, metadata?: Record<string, any>): void {
    logger.info(message, 'sync', { ...metadata, roomId })
  }

  static performance(operation: string, duration: number, metadata?: Record<string, any>): void {
    logger.logPerformance(operation, duration, metadata)
  }

  static security(event: string, severity: 'low' | 'medium' | 'high' | 'critical', metadata?: Record<string, any>): void {
    logger.logSecurity(event, severity, metadata)
  }

  static business(action: string, userId: string, metadata?: Record<string, any>): void {
    logger.logBusiness(action, userId, metadata)
  }

  static request(req: NextRequest, responseTime?: number, statusCode?: number, userId?: string): void {
    logger.logRequest(req, responseTime, statusCode, userId)
  }
}

// Export logger for direct use
export { StructuredLogger }

// Initialize logger on module load
process.on('SIGTERM', () => {
  logger.shutdown()
})

process.on('SIGINT', () => {
  logger.shutdown()
})