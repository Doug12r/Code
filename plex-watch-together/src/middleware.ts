import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { rateLimit, checkSecurityBlocklist } from '@/lib/rate-limit'

export function middleware(request: NextRequest) {
  // Skip middleware for static files and images
  if (
    request.nextUrl.pathname.startsWith('/_next/') ||
    request.nextUrl.pathname.startsWith('/static/') ||
    request.nextUrl.pathname.match(/\.(ico|png|jpg|jpeg|gif|svg|webp)$/)
  ) {
    return NextResponse.next()
  }

  // Security checks
  const securityResponse = checkSecurityBlocklist(request)
  if (securityResponse) {
    return securityResponse
  }

  // Apply different rate limits based on route
  const pathname = request.nextUrl.pathname

  // Auth routes - stricter rate limiting
  if (pathname.startsWith('/api/auth/')) {
    return applyRateLimit(request, 'auth')
  }

  // Plex API routes - moderate rate limiting
  if (pathname.startsWith('/api/plex/')) {
    return applyRateLimit(request, 'plex')
  }

  // Socket/real-time routes - more lenient
  if (pathname.startsWith('/api/socket/')) {
    return applyRateLimit(request, 'realtime')
  }

  // General API routes
  if (pathname.startsWith('/api/')) {
    return applyRateLimit(request, 'general')
  }

  return NextResponse.next()
}

async function applyRateLimit(request: NextRequest, type: 'auth' | 'plex' | 'realtime' | 'general') {
  const rateLimitResponse = await rateLimit(request, type)
  
  if (rateLimitResponse) {
    return rateLimitResponse
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}