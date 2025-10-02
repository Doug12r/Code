import { NextRequest, NextResponse } from 'next/server'
import { RateLimiterMemory } from 'rate-limiter-flexible'

// Rate limiter configurations
const rateLimiters = {
  // General API rate limiting
  general: new RateLimiterMemory({
    points: process.env.NODE_ENV === 'development' ? 300 : 100, // More points in dev
    duration: 60, // Per 60 seconds
    blockDuration: process.env.NODE_ENV === 'development' ? 30 : 60, // Shorter block in dev
  }),

  // Auth endpoints (less restrictive for development)
  auth: new RateLimiterMemory({
    points: process.env.NODE_ENV === 'development' ? 50 : 10, // More points in dev
    duration: 60, // Per 60 seconds
    blockDuration: process.env.NODE_ENV === 'development' ? 60 : 300, // Shorter block in dev
  }),

  // Plex API endpoints (moderate restrictions)
  plex: new RateLimiterMemory({
    points: 30, // Number of requests
    duration: 60, // Per 60 seconds
    blockDuration: 120, // Block for 2 minutes if exceeded
  }),

  // Socket/real-time endpoints
  realtime: new RateLimiterMemory({
    points: 200, // Number of requests
    duration: 60, // Per 60 seconds
    blockDuration: 30, // Block for 30 seconds if exceeded
  }),
}

type RateLimiterType = keyof typeof rateLimiters

/**
 * Get client IP address from request headers
 */
function getClientIP(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')
  const cfConnectingIP = request.headers.get('cf-connecting-ip')
  
  if (cfConnectingIP) return cfConnectingIP
  if (realIP) return realIP
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  
  return 'unknown'
}

/**
 * Rate limiting middleware
 */
export async function rateLimit(
  request: NextRequest,
  type: RateLimiterType = 'general'
): Promise<NextResponse | null> {
  try {
    const clientIP = getClientIP(request)
    const limiter = rateLimiters[type]
    
    await limiter.consume(clientIP)
    return null // No rate limit exceeded
    
  } catch (rateLimiterRes: any) {
    const remainingPoints = rateLimiterRes?.remainingPoints || 0
    const msBeforeNext = rateLimiterRes?.msBeforeNext || 0
    const totalHits = rateLimiterRes?.totalHits || 0
    
    console.warn(`Rate limit exceeded for IP ${getClientIP(request)}:`, {
      type,
      remainingPoints,
      msBeforeNext,
      totalHits,
      endpoint: request.nextUrl.pathname
    })

    return NextResponse.json({
      error: 'Rate limit exceeded',
      type: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.round(msBeforeNext / 1000),
      details: {
        limit: rateLimiters[type].points,
        windowMs: rateLimiters[type].duration * 1000,
        remaining: remainingPoints
      }
    }, {
      status: 429,
      headers: {
        'Retry-After': Math.round(msBeforeNext / 1000).toString(),
        'X-RateLimit-Limit': rateLimiters[type].points.toString(),
        'X-RateLimit-Remaining': remainingPoints.toString(),
        'X-RateLimit-Reset': new Date(Date.now() + msBeforeNext).toISOString(),
      }
    })
  }
}

/**
 * Higher-order function to wrap API routes with rate limiting
 */
export function withRateLimit(
  handler: (request: NextRequest, ...args: any[]) => Promise<NextResponse>,
  type: RateLimiterType = 'general'
) {
  return async (request: NextRequest, ...args: any[]) => {
    const rateLimitResponse = await rateLimit(request, type)
    
    if (rateLimitResponse) {
      return rateLimitResponse
    }
    
    return handler(request, ...args)
  }
}

/**
 * IP-based blocking for security threats
 */
class SecurityBlocklist {
  private blockedIPs = new Set<string>()
  private suspiciousAttempts = new Map<string, number>()
  private readonly maxSuspiciousAttempts = 10
  
  addSuspiciousActivity(ip: string) {
    const attempts = this.suspiciousAttempts.get(ip) || 0
    this.suspiciousAttempts.set(ip, attempts + 1)
    
    if (attempts + 1 >= this.maxSuspiciousAttempts) {
      this.blockIP(ip)
      console.warn(`IP ${ip} blocked due to suspicious activity`)
    }
  }
  
  blockIP(ip: string) {
    this.blockedIPs.add(ip)
    
    // Auto-unblock after 24 hours
    setTimeout(() => {
      this.blockedIPs.delete(ip)
      this.suspiciousAttempts.delete(ip)
      console.log(`IP ${ip} auto-unblocked`)
    }, 24 * 60 * 60 * 1000)
  }
  
  isBlocked(ip: string): boolean {
    return this.blockedIPs.has(ip)
  }
  
  unblockIP(ip: string) {
    this.blockedIPs.delete(ip)
    this.suspiciousAttempts.delete(ip)
  }
}

export const securityBlocklist = new SecurityBlocklist()

/**
 * Security middleware to check for blocked IPs
 */
export function checkSecurityBlocklist(request: NextRequest): NextResponse | null {
  const clientIP = getClientIP(request)
  
  if (securityBlocklist.isBlocked(clientIP)) {
    console.warn(`Blocked IP ${clientIP} attempted to access ${request.nextUrl.pathname}`)
    
    return NextResponse.json({
      error: 'Access denied',
      type: 'IP_BLOCKED',
      message: 'Your IP address has been temporarily blocked due to suspicious activity'
    }, { status: 403 })
  }
  
  return null
}