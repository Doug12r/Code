import { NextRequest, NextResponse } from 'next/server'
import { getPlexService } from '@/lib/plex-service'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-production'

/**
 * Enhanced Plex Health API Endpoint
 * Provides comprehensive health monitoring and diagnostics
 */

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const detailed = searchParams.get('detailed') === 'true'
    const diagnostics = searchParams.get('diagnostics') === 'true'

    const plexService = getPlexService()

    if (diagnostics) {
      // Run comprehensive diagnostics
      const diagnosticResults = await plexService.performDiagnostics()
      
      return NextResponse.json({
        status: 'diagnostics_complete',
        timestamp: new Date().toISOString(),
        diagnostics: diagnosticResults,
        metrics: plexService.getMetrics()
      })
    }

    if (detailed) {
      // Return detailed health and performance metrics
      const health = plexService.getConnectionHealth()
      const metrics = plexService.getMetrics()
      
      return NextResponse.json({
        status: health.status,
        timestamp: new Date().toISOString(),
        health,
        metrics,
        performance: {
          cacheEfficiency: `${metrics.cacheHitRate}%`,
          avgResponseTime: `${Math.round(metrics.averageResponseTime)}ms`,
          successRate: `${metrics.successRate}%`,
          uptime: formatDuration(metrics.uptime)
        }
      })
    }

    // Basic health check
    const health = plexService.getConnectionHealth()
    
    return NextResponse.json({
      status: health.status,
      timestamp: new Date().toISOString(),
      healthy: health.isHealthy,
      latency: health.latency,
      lastCheck: new Date(health.lastCheck).toISOString()
    })

  } catch (error: any) {
    console.error('Plex health check failed:', error)
    
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      healthy: false,
      error: error.message || 'Health check failed'
    }, { status: 500 })
  }
}

/**
 * Handle Plex service actions
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { action } = await request.json()
    const plexService = getPlexService()

    switch (action) {
      case 'preload':
        const startTime = Date.now()
        await plexService.preloadCommonData()
        const loadTime = Date.now() - startTime
        const metrics = plexService.getMetrics()

        return NextResponse.json({
          status: 'preload_complete',
          timestamp: new Date().toISOString(),
          loadTime: `${loadTime}ms`,
          cacheStatus: {
            entries: metrics.cacheSize,
            hitRate: `${metrics.cacheHitRate}%`
          }
        })

      case 'clear_cache':
        const metricsBefore = plexService.getMetrics()
        plexService.clearCache()
        const metricsAfter = plexService.getMetrics()

        return NextResponse.json({
          status: 'cache_cleared',
          timestamp: new Date().toISOString(),
          cleared: {
            cacheEntries: metricsBefore.cacheSize,
            activeRequests: metricsBefore.activeRequests
          },
          current: {
            cacheEntries: metricsAfter.cacheSize,
            activeRequests: metricsAfter.activeRequests
          }
        })

      case 'diagnostics':
        const diagnosticResults = await plexService.performDiagnostics()
        
        return NextResponse.json({
          status: 'diagnostics_complete',
          timestamp: new Date().toISOString(),
          diagnostics: diagnosticResults,
          metrics: plexService.getMetrics()
        })

      default:
        return NextResponse.json(
          { error: 'Invalid action. Supported actions: preload, clear_cache, diagnostics' },
          { status: 400 }
        )
    }

  } catch (error: any) {
    console.error('Plex service action failed:', error)
    
    return NextResponse.json({
      status: 'error',
      error: error.message || 'Action failed'
    }, { status: 500 })
  }
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}