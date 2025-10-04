import { NextResponse, NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { withRateLimit, authLimiter, apiLimiter, strictLimiter } from './rate-limit-enhanced'
import { securityHeaders } from './security-validation'

// Security middleware configuration
interface SecurityConfig {
  requireAuth?: boolean
  requireTwoFactor?: boolean
  rateLimit?: 'auth' | 'api' | 'strict' | 'none'
  allowedOrigins?: string[]
  requireCSRF?: boolean
  logSecurityEvents?: boolean
}

const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  requireAuth: true,
  requireTwoFactor: false,
  rateLimit: 'api',
  allowedOrigins: [],
  requireCSRF: true,
  logSecurityEvents: true
}

// Security event logger
class SecurityLogger {
  static log(event: string, details: any, severity: 'low' | 'medium' | 'high' | 'critical' = 'medium') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      severity,
      details: {
        ...details,
        userAgent: details.userAgent?.slice(0, 200), // Truncate long user agents
      }
    }

    if (severity === 'critical' || severity === 'high') {
      console.error('SECURITY EVENT:', logEntry)
    } else {
      console.log('Security Event:', logEntry)
    }

    // In production, send to security monitoring service
    // await sendToSecurityMonitoring(logEntry)
  }
}

// CSRF token validation
async function validateCSRFToken(req: NextRequest): Promise<boolean> {
  const token = req.headers.get('x-csrf-token') || req.nextUrl.searchParams.get('csrf_token')
  
  if (!token) {
    return false
  }

  // Get session to validate token
  const session = await getToken({ req })
  if (!session?.sessionId) {
    return false
  }

  // In production, validate against stored token
  // For now, check basic format
  return /^[a-f0-9]{64}$/.test(token)
}

// Origin validation
function validateOrigin(req: NextRequest, allowedOrigins: string[]): boolean {
  const origin = req.headers.get('origin')
  const referer = req.headers.get('referer')
  
  if (!origin && !referer) {
    return true // Allow same-origin requests without origin header
  }

  const requestOrigin = origin || (referer ? new URL(referer).origin : null)
  
  if (!requestOrigin) {
    return false
  }

  // Allow configured origins
  if (allowedOrigins.length > 0) {
    return allowedOrigins.includes(requestOrigin)
  }

  // Default: allow same origin
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  return requestOrigin === baseUrl
}

// Suspicious request detection
function detectSuspiciousActivity(req: NextRequest): {
  isSuspicious: boolean
  reasons: string[]
} {
  const reasons: string[] = []
  
  // Check for suspicious user agents
  const userAgent = req.headers.get('user-agent') || ''
  if (!userAgent || userAgent.length < 10) {
    reasons.push('Missing or suspicious user agent')
  }

  // Check for automation indicators
  const automationIndicators = ['bot', 'crawler', 'spider', 'scraper', 'curl', 'wget']
  if (automationIndicators.some(indicator => userAgent.toLowerCase().includes(indicator))) {
    reasons.push('Automated request detected')
  }

  // Check for suspicious headers
  const suspiciousHeaders = [
    'x-forwarded-for',
    'x-real-ip',
    'x-cluster-client-ip',
    'x-forwarded',
    'forwarded-for'
  ]
  
  let forwardedCount = 0
  suspiciousHeaders.forEach(header => {
    if (req.headers.get(header)) forwardedCount++
  })
  
  if (forwardedCount > 2) {
    reasons.push('Multiple proxy headers detected')
  }

  // Check for suspicious paths
  const pathname = req.nextUrl.pathname
  const suspiciousPaths = [
    '/admin', '/wp-admin', '/.env', '/config',
    '/phpmyadmin', '/mysql', '/database',
    '/backup', '/logs', '/.git'
  ]
  
  if (suspiciousPaths.some(path => pathname.includes(path))) {
    reasons.push('Suspicious path access attempt')
  }

  return {
    isSuspicious: reasons.length > 0,
    reasons
  }
}

// Main security middleware
export function createSecurityMiddleware(config: Partial<SecurityConfig> = {}) {
  const finalConfig = { ...DEFAULT_SECURITY_CONFIG, ...config }

  return async function securityMiddleware(req: NextRequest): Promise<NextResponse | null> {
    const startTime = Date.now()
    
    try {
      // Add security headers to response
      const response = NextResponse.next()
      Object.entries(securityHeaders).forEach(([key, value]) => {
        response.headers.set(key, value)
      })

      // Rate limiting
      if (finalConfig.rateLimit !== 'none') {
        const limiter = {
          auth: authLimiter,
          api: apiLimiter,
          strict: strictLimiter
        }[finalConfig.rateLimit || 'api']

        const rateLimitResponse = await limiter.createMiddleware()(req)
        if (rateLimitResponse) {
          SecurityLogger.log('Rate limit exceeded', {
            path: req.nextUrl.pathname,
            ip: req.headers.get('x-forwarded-for') || 'unknown',
            userAgent: req.headers.get('user-agent')
          }, 'medium')
          
          return rateLimitResponse
        }
      }

      // Origin validation
      if (req.method !== 'GET' && !validateOrigin(req, finalConfig.allowedOrigins || [])) {
        SecurityLogger.log('Invalid origin', {
          origin: req.headers.get('origin'),
          referer: req.headers.get('referer'),
          path: req.nextUrl.pathname
        }, 'high')

        return NextResponse.json(
          { error: 'Invalid origin' },
          { status: 403 }
        )
      }

      // CSRF protection for state-changing requests
      if (finalConfig.requireCSRF && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        const isValidCSRF = await validateCSRFToken(req)
        if (!isValidCSRF) {
          SecurityLogger.log('CSRF token validation failed', {
            path: req.nextUrl.pathname,
            method: req.method
          }, 'high')

          return NextResponse.json(
            { error: 'Invalid CSRF token' },
            { status: 403 }
          )
        }
      }

      // Authentication check
      if (finalConfig.requireAuth) {
        const token = await getToken({ req })
        if (!token) {
          return NextResponse.json(
            { error: 'Authentication required' },
            { status: 401 }
          )
        }

        // Two-factor authentication check
        if (finalConfig.requireTwoFactor && !token.twoFactorVerified) {
          return NextResponse.json(
            { error: 'Two-factor authentication required' },
            { status: 401 }
          )
        }
      }

      // Suspicious activity detection
      const suspiciousActivity = detectSuspiciousActivity(req)
      if (suspiciousActivity.isSuspicious) {
        SecurityLogger.log('Suspicious activity detected', {
          reasons: suspiciousActivity.reasons,
          path: req.nextUrl.pathname,
          ip: req.headers.get('x-forwarded-for') || 'unknown',
          userAgent: req.headers.get('user-agent')
        }, 'medium')

        // Don't block immediately, but log for monitoring
      }

      // Log security events
      if (finalConfig.logSecurityEvents) {
        SecurityLogger.log('Request processed', {
          path: req.nextUrl.pathname,
          method: req.method,
          responseTime: Date.now() - startTime,
          authenticated: !!(await getToken({ req }))
        }, 'low')
      }

      return response

    } catch (error) {
      SecurityLogger.log('Security middleware error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: req.nextUrl.pathname
      }, 'high')

      return NextResponse.json(
        { error: 'Security validation failed' },
        { status: 500 }
      )
    }
  }
}

// Pre-configured middleware for different route types
export const authMiddleware = createSecurityMiddleware({
  requireAuth: true,
  rateLimit: 'auth',
  requireCSRF: true
})

export const apiMiddleware = createSecurityMiddleware({
  requireAuth: true,
  rateLimit: 'api',
  requireCSRF: true
})

export const publicMiddleware = createSecurityMiddleware({
  requireAuth: false,
  rateLimit: 'api',
  requireCSRF: false
})

export const strictMiddleware = createSecurityMiddleware({
  requireAuth: true,
  requireTwoFactor: true,
  rateLimit: 'strict',
  requireCSRF: true
})

// Utility functions for API routes
export async function withSecurityCheck(
  req: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>,
  config: Partial<SecurityConfig> = {}
) {
  const middleware = createSecurityMiddleware(config)
  const securityResponse = await middleware(req)
  
  if (securityResponse && securityResponse.status >= 400) {
    return securityResponse
  }
  
  return handler(req)
}

// Security audit logging
export class SecurityAudit {
  static async logEvent(event: {
    type: 'login' | 'logout' | 'permission_denied' | 'data_access' | 'admin_action'
    userId?: string
    details?: any
    severity?: 'low' | 'medium' | 'high' | 'critical'
  }) {
    const auditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...event
    }

    // Store in database for compliance
    try {
      // In production, store in audit table
      console.log('AUDIT LOG:', auditEntry)
    } catch (error) {
      console.error('Failed to log security audit:', error)
    }
  }

  static async getAuditTrail(userId?: string, limit: number = 100) {
    // In production, query audit table
    return {
      events: [],
      total: 0
    }
  }
}