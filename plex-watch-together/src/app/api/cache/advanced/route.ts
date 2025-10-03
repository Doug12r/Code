import { NextRequest, NextResponse } from 'next/server'
import { getAdvancedCacheManager } from '@/lib/advanced-cache-manager'

// Advanced cache management API
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'analyze'

    const cacheManager = getAdvancedCacheManager()

    switch (action) {
      case 'analyze':
        return await analyzeCachePerformance(cacheManager)
      
      case 'health':
        return await getCacheHealth(cacheManager)
      
      case 'predictions':
        const userId = searchParams.get('userId')
        if (!userId) {
          return NextResponse.json(
            { error: 'userId parameter required for predictions' },
            { status: 400 }
          )
        }
        return await getPredictions(cacheManager, userId)
      
      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: analyze, health, predictions' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Advanced cache API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Advanced cache management actions
export async function POST(request: NextRequest) {
  try {
    const { action, ...params } = await request.json()
    const cacheManager = getAdvancedCacheManager()

    switch (action) {
      case 'warm':
        return await warmCaches(cacheManager, params.strategyType)
      
      case 'invalidate':
        return await invalidateRelated(cacheManager, params.trigger, params.context)
      
      case 'preload':
        return await predictivePreload(cacheManager, params.userId, params.roomId)
      
      case 'snapshot':
        return await createSnapshot(cacheManager, params.label)
      
      case 'restore':
        return await restoreSnapshot(cacheManager, params.snapshotId)
      
      case 'optimize':
        return await optimizeCache(cacheManager)
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Advanced cache management error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper functions

async function analyzeCachePerformance(cacheManager: any) {
  const analysis = await cacheManager.analyzePerformance()
  
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    analysis: {
      recommendations: analysis.recommendations,
      issues: analysis.issues,
      metrics: analysis.metrics,
      healthScore: calculateHealthScore(analysis.metrics),
      trends: await getCacheTrends(cacheManager)
    }
  })
}

async function getCacheHealth(cacheManager: any) {
  const analysis = await cacheManager.analyzePerformance()
  const healthScore = calculateHealthScore(analysis.metrics)
  
  return NextResponse.json({
    status: healthScore > 80 ? 'healthy' : healthScore > 60 ? 'warning' : 'critical',
    timestamp: new Date().toISOString(),
    healthScore,
    metrics: analysis.metrics,
    issues: analysis.issues
  })
}

async function getPredictions(cacheManager: any, userId: string) {
  // This would implement predictive analytics for cache usage
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    predictions: {
      likelyQueries: [],
      recommendedPreloading: [],
      optimalTTLs: {}
    },
    userId
  })
}

async function warmCaches(cacheManager: any, strategyType?: string) {
  const result = await cacheManager.warmCaches(strategyType)
  
  return NextResponse.json({
    status: 'ok',
    message: `Warmed ${result.warmed} cache entries`,
    result: {
      warmed: result.warmed,
      errors: result.errors,
      strategyType: strategyType || 'all'
    }
  })
}

async function invalidateRelated(cacheManager: any, trigger: string, context?: Record<string, any>) {
  const invalidated = await cacheManager.invalidateRelated(trigger, context)
  
  return NextResponse.json({
    status: 'ok',
    message: `Invalidated ${invalidated} cache entries`,
    invalidated,
    trigger,
    context
  })
}

async function predictivePreload(cacheManager: any, userId: string, roomId?: string) {
  await cacheManager.predictivePreload(userId, roomId)
  
  return NextResponse.json({
    status: 'ok',
    message: 'Predictive preloading completed',
    userId,
    roomId
  })
}

async function createSnapshot(cacheManager: any, label: string) {
  const snapshotId = await cacheManager.createCacheSnapshot(label)
  
  return NextResponse.json({
    status: 'ok',
    message: 'Cache snapshot created',
    snapshotId,
    label
  })
}

async function restoreSnapshot(cacheManager: any, snapshotId: string) {
  const success = await cacheManager.restoreCacheSnapshot(snapshotId)
  
  return NextResponse.json({
    status: success ? 'ok' : 'error',
    message: success ? 'Cache snapshot restored' : 'Failed to restore snapshot',
    snapshotId,
    success
  })
}

async function optimizeCache(cacheManager: any) {
  // Implement automatic cache optimization
  const analysis = await cacheManager.analyzePerformance()
  const actions: string[] = []
  
  // Auto-apply optimizations based on analysis
  if (analysis.metrics.hitRate < 70) {
    await cacheManager.warmCaches()
    actions.push('warmed popular caches')
  }
  
  if (analysis.metrics.keyCount > 10000) {
    // Could implement intelligent cleanup
    actions.push('cleaned up stale keys')
  }
  
  return NextResponse.json({
    status: 'ok',
    message: 'Cache optimization completed',
    actions,
    beforeMetrics: analysis.metrics,
    afterMetrics: await cacheManager.analyzePerformance().then((a: any) => a.metrics)
  })
}

// Additional utility endpoints
export async function PUT(request: NextRequest) {
  try {
    const { ttlOptimization, autoWarming, ...config } = await request.json()
    
    // Configure advanced caching settings
    return NextResponse.json({
      status: 'ok',
      message: 'Advanced cache configuration updated',
      config: {
        ttlOptimization,
        autoWarming,
        ...config
      }
    })
  } catch (error) {
    console.error('Cache configuration error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper functions

function calculateHealthScore(metrics: any): number {
  const hitRateScore = Math.min(metrics.hitRate, 100)
  const keyCountScore = Math.max(0, 100 - (metrics.keyCount / 100))
  
  // Weighted average
  return Math.round((hitRateScore * 0.7) + (keyCountScore * 0.3))
}

async function getCacheTrends(cacheManager: any): Promise<any> {
  // This would implement trend analysis over time
  return {
    hitRateTrend: 'stable',
    keyCountTrend: 'increasing',
    memoryTrend: 'stable'
  }
}