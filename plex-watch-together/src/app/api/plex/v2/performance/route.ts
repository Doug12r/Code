import { NextRequest, NextResponse } from 'next/server'
import { getPlexService } from '@/lib/plex-service'

/**
 * Performance and Health Monitoring API
 * 
 * Shows real-time metrics about:
 * - Cache performance (hit rates, size)
 * - Request deduplication effectiveness  
 * - Average response times
 * - Error rates
 * - Active request count
 */
export async function GET() {
  try {
    const plexService = getPlexService()
    const metrics = plexService.getMetrics()
    
    // Calculate additional insights
    const insights = {
      performance: {
        status: metrics.averageResponseTime < 1000 ? 'Excellent' : 
               metrics.averageResponseTime < 3000 ? 'Good' : 'Needs Attention',
        responseTimeMs: Math.round(metrics.averageResponseTime),
        errorRatePercent: Math.round(metrics.errorRate * 100)
      },
      
      caching: {
        effectiveness: metrics.cacheHitRate > 70 ? 'Excellent' :
                     metrics.cacheHitRate > 40 ? 'Good' : 'Poor',
        hitRatePercent: metrics.cacheHitRate,
        entriesStored: metrics.cacheSize,
        memorySaved: metrics.cacheHits // Number of API calls avoided
      },
      
      deduplication: {
        requestsSaved: metrics.deduplicatedRequests,
        isEffective: metrics.deduplicatedRequests > 0
      },
      
      system: {
        activeRequests: metrics.activeRequests,
        totalProcessed: metrics.totalRequests,
        uptime: process.uptime()
      }
    }
    
    return NextResponse.json({
      metrics,
      insights,
      recommendations: generateRecommendations(metrics),
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Metrics API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    )
  }
}

/**
 * Control endpoint for cache management
 */
export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json()
    const plexService = getPlexService()
    
    switch (action) {
      case 'clearCache':
        plexService.clearCache()
        return NextResponse.json({ message: 'Cache cleared successfully' })
        
      case 'preload':
        await plexService.preloadCommonData()
        return NextResponse.json({ message: 'Common data preloaded' })
        
      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: clearCache, preload' },
          { status: 400 }
        )
    }
    
  } catch (error) {
    console.error('Control API error:', error)
    return NextResponse.json(
      { error: 'Control action failed' },
      { status: 500 }
    )
  }
}

/**
 * Generate performance recommendations
 */
function generateRecommendations(metrics: any): string[] {
  const recommendations: string[] = []
  
  if (metrics.cacheHitRate < 30) {
    recommendations.push('Low cache hit rate - consider increasing cache TTL values')
  }
  
  if (metrics.averageResponseTime > 3000) {
    recommendations.push('High response times - check network connectivity to Plex server')
  }
  
  if (metrics.errorRate > 0.1) {
    recommendations.push('High error rate - investigate Plex server connectivity issues')
  }
  
  if (metrics.deduplicatedRequests > metrics.totalRequests * 0.2) {
    recommendations.push('High deduplication rate detected - this is saving significant API calls!')
  }
  
  if (metrics.cacheHitRate > 70) {
    recommendations.push('Excellent cache performance - plugin is working optimally')
  }
  
  if (recommendations.length === 0) {
    recommendations.push('All systems operating efficiently')
  }
  
  return recommendations
}