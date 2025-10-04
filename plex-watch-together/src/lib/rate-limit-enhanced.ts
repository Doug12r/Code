import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'

interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  max: number // Maximum requests per window
  message?: string
  statusCode?: number
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
  keyGenerator?: (req: NextRequest) => string
  skip?: (req: NextRequest) => boolean
}

interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
    firstRequest: number
  }
}

class RateLimiter {
  private store: RateLimitStore = {}
  private config: Required<RateLimitConfig>

  constructor(config: RateLimitConfig) {
    this.config = {
      windowMs: config.windowMs,
      max: config.max,
      message: config.message || 'Too many requests from this IP, please try again later',
      statusCode: config.statusCode || 429,
      skipSuccessfulRequests: config.skipSuccessfulRequests || false,
      skipFailedRequests: config.skipFailedRequests || false,
      keyGenerator: config.keyGenerator || this.defaultKeyGenerator,
      skip: config.skip || (() => false)
    }
  }

  private defaultKeyGenerator(req: NextRequest): string {
    // Try to get the real IP from various headers
    const forwarded = req.headers.get('x-forwarded-for')
    const realIp = req.headers.get('x-real-ip')
    const cfConnectingIp = req.headers.get('cf-connecting-ip')
    const ip = forwarded?.split(',')[0]?.trim() || realIp || cfConnectingIp || 'unknown'
    
    return `rate-limit:${ip}`
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now()
    Object.keys(this.store).forEach(key => {
      if (this.store[key].resetTime < now) {
        delete this.store[key]
      }
    })
  }

  async limit(req: NextRequest): Promise<{
    success: boolean
    limit: number
    remaining: number
    resetTime: number
    retryAfter?: number
  }> {
    // Skip if configured
    if (this.config.skip(req)) {
      return {
        success: true,
        limit: this.config.max,
        remaining: this.config.max,
        resetTime: Date.now() + this.config.windowMs
      }
    }

    const key = this.config.keyGenerator(req)
    const now = Date.now()
    
    // Clean up expired entries periodically
    this.cleanupExpiredEntries()

    // Get or create entry
    let entry = this.store[key]
    
    if (!entry || entry.resetTime < now) {
      // Create new entry or reset expired one
      entry = {
        count: 0,
        resetTime: now + this.config.windowMs,
        firstRequest: now
      }
      this.store[key] = entry
    }

    // Increment count
    entry.count++

    const remaining = Math.max(0, this.config.max - entry.count)
    const success = entry.count <= this.config.max

    return {
      success,
      limit: this.config.max,
      remaining,
      resetTime: entry.resetTime,
      retryAfter: success ? undefined : Math.ceil((entry.resetTime - now) / 1000)
    }
  }

  createMiddleware() {
    return async (req: NextRequest): Promise<NextResponse | null> => {
      const result = await this.limit(req)
      
      if (!result.success) {
        return NextResponse.json(
          { 
            error: this.config.message,
            limit: result.limit,
            remaining: result.remaining,
            resetTime: result.resetTime,
            retryAfter: result.retryAfter
          },
          { 
            status: this.config.statusCode,
            headers: {
              'X-RateLimit-Limit': result.limit.toString(),
              'X-RateLimit-Remaining': result.remaining.toString(),
              'X-RateLimit-Reset': result.resetTime.toString(),
              'Retry-After': result.retryAfter?.toString() || '60'
            }
          }
        )
      }

      return null // Continue to next middleware
    }
  }
}

// Pre-configured rate limiters for different endpoints
export const authLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many authentication attempts, please try again later',
  statusCode: 429
})

export const apiLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'API rate limit exceeded',
  statusCode: 429
})

export const strictLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'Rate limit exceeded for this endpoint',
  statusCode: 429
})

export const uploadLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 uploads per hour
  message: 'Upload limit exceeded, please try again later',
  statusCode: 429
})

// Utility function for manual rate limiting in API routes
export async function checkRateLimit(
  req: NextRequest, 
  limiter: RateLimiter
): Promise<NextResponse | null> {
  return await limiter.createMiddleware()(req)
}

// Advanced rate limiting with multiple tiers
export class TieredRateLimiter {
  private limiters: Array<{ limiter: RateLimiter; priority: number }>

  constructor(configs: Array<{ config: RateLimitConfig; priority: number }>) {
    this.limiters = configs
      .sort((a, b) => a.priority - b.priority)
      .map(({ config, priority }) => ({
        limiter: new RateLimiter(config),
        priority
      }))
  }

  async checkLimits(req: NextRequest): Promise<NextResponse | null> {
    for (const { limiter } of this.limiters) {
      const response = await limiter.createMiddleware()(req)
      if (response) {
        return response // Return first rate limit violation
      }
    }
    return null
  }
}

// IP-based suspicious activity detection
export class SecurityMonitor {
  private suspiciousActivity: Map<string, {
    failedAttempts: number
    lastAttempt: number
    blocked: boolean
    blockExpiry?: number
  }> = new Map()

  private getClientIp(req: NextRequest): string {
    const forwarded = req.headers.get('x-forwarded-for')
    const realIp = req.headers.get('x-real-ip')
    const cfConnectingIp = req.headers.get('cf-connecting-ip')
    return forwarded?.split(',')[0]?.trim() || realIp || cfConnectingIp || 'unknown'
  }

  recordFailedAttempt(req: NextRequest, severity: 'low' | 'medium' | 'high' = 'medium'): void {
    const ip = this.getClientIp(req)
    const now = Date.now()
    
    let record = this.suspiciousActivity.get(ip) || {
      failedAttempts: 0,
      lastAttempt: now,
      blocked: false
    }

    const severityMultiplier = { low: 1, medium: 2, high: 5 }[severity]
    record.failedAttempts += severityMultiplier
    record.lastAttempt = now

    // Auto-block after too many failures
    if (record.failedAttempts >= 10) {
      record.blocked = true
      record.blockExpiry = now + (24 * 60 * 60 * 1000) // 24 hours
    }

    this.suspiciousActivity.set(ip, record)
  }

  isBlocked(req: NextRequest): boolean {
    const ip = this.getClientIp(req)
    const record = this.suspiciousActivity.get(ip)
    
    if (!record || !record.blocked) return false
    
    // Check if block has expired
    if (record.blockExpiry && Date.now() > record.blockExpiry) {
      record.blocked = false
      record.blockExpiry = undefined
      record.failedAttempts = 0
      return false
    }

    return true
  }

  clearRecord(req: NextRequest): void {
    const ip = this.getClientIp(req)
    this.suspiciousActivity.delete(ip)
  }

  getSuspiciousIps(): Array<{
    ip: string
    failedAttempts: number
    lastAttempt: number
    blocked: boolean
  }> {
    return Array.from(this.suspiciousActivity.entries()).map(([ip, record]) => ({
      ip,
      ...record
    }))
  }
}

export const securityMonitor = new SecurityMonitor()

// Utility function to apply rate limiting to API routes
export function withRateLimit(limiter: RateLimiter) {
  return function <T extends any[]>(
    handler: (req: NextRequest, ...args: T) => Promise<NextResponse>
  ) {
    return async (req: NextRequest, ...args: T): Promise<NextResponse> => {
      // Check if IP is blocked
      if (securityMonitor.isBlocked(req)) {
        return NextResponse.json(
          { error: 'IP address temporarily blocked due to suspicious activity' },
          { status: 403 }
        )
      }

      // Apply rate limiting
      const rateLimitResponse = await limiter.createMiddleware()(req)
      if (rateLimitResponse) {
        securityMonitor.recordFailedAttempt(req, 'low')
        return rateLimitResponse
      }

      try {
        return await handler(req, ...args)
      } catch (error) {
        // Log potential security issues
        if (error instanceof Error && error.message.includes('validation')) {
          securityMonitor.recordFailedAttempt(req, 'medium')
        }
        throw error
      }
    }
  }
}