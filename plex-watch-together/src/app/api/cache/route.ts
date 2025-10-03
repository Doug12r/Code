import { NextRequest, NextResponse } from 'next/server'
import { getCachingService } from '@/lib/caching-service'
import { getRedisClient } from '@/lib/redis'
import { getSessionManager } from '@/lib/session-manager'

// Cache management and health monitoring API
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'status'

    const cache = getCachingService()
    const redis = getRedisClient()
    const sessionManager = getSessionManager()

    switch (action) {
      case 'status':
        return await getCacheStatus(cache, redis)
      
      case 'stats':
        return await getCacheStats(cache)
      
      case 'health':
        return await getCacheHealth(cache)
      
      case 'info':
        return await getCacheInfo(cache)
      
      case 'sessions':
        return await getSessionStats(sessionManager)
      
      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: status, stats, health, info, sessions' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Cache API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Admin actions for cache management
export async function POST(request: NextRequest) {
  try {
    const { action, type, key, pattern } = await request.json()
    const cache = getCachingService()

    switch (action) {
      case 'clear':
        return await clearCache(cache, type)
      
      case 'delete':
        return await deleteCache(cache, type, key)
      
      case 'warm':
        return await warmCache(cache, type)
      
      case 'invalidate':
        return await invalidatePattern(cache, pattern)
      
      case 'reset-stats':
        return await resetStats(cache)
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Cache management error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper functions

async function getCacheStatus(cache: any, redis: any) {
  const [cacheHealth, redisStats, cacheInfo] = await Promise.all([
    cache.healthCheck(),
    redis.getStats(),
    cache.getCacheInfo()
  ])

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    cache: {
      health: cacheHealth,
      redis: redisStats,
      info: cacheInfo
    }
  })
}

async function getCacheStats(cache: any) {
  const stats = cache.getStats()
  
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    stats
  })
}

async function getCacheHealth(cache: any) {
  const health = await cache.healthCheck()
  
  return NextResponse.json({
    status: health.status,
    timestamp: new Date().toISOString(),
    health
  })
}

async function getCacheInfo(cache: any) {
  const info = await cache.getCacheInfo()
  
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    info
  })
}

async function getSessionStats(sessionManager: any) {
  const stats = await sessionManager.getSessionStats()
  
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    sessions: stats
  })
}

async function clearCache(cache: any, type: string) {
  if (!type) {
    return NextResponse.json(
      { error: 'Type parameter required' },
      { status: 400 }
    )
  }

  const cleared = await cache.clearType(type as any)
  
  return NextResponse.json({
    status: 'ok',
    message: `Cleared ${cleared} cache entries for type: ${type}`,
    cleared
  })
}

async function deleteCache(cache: any, type: string, key: string) {
  if (!type || !key) {
    return NextResponse.json(
      { error: 'Type and key parameters required' },
      { status: 400 }
    )
  }

  const deleted = await cache.delete(type as any, key)
  
  return NextResponse.json({
    status: deleted ? 'ok' : 'not_found',
    message: deleted 
      ? `Deleted cache entry: ${type}:${key}` 
      : `Cache entry not found: ${type}:${key}`,
    deleted
  })
}

async function warmCache(cache: any, type: string) {
  if (!type) {
    return NextResponse.json(
      { error: 'Type parameter required' },
      { status: 400 }
    )
  }

  // Example cache warming - would need specific implementation per type
  let warmed = false
  
  switch (type) {
    case 'PLEX_LIBRARIES':
      // Would implement specific warming logic
      console.log(`🔥 Warming cache for: ${type}`)
      warmed = true
      break
    
    default:
      return NextResponse.json(
        { error: `Cache warming not implemented for type: ${type}` },
        { status: 400 }
      )
  }
  
  return NextResponse.json({
    status: 'ok',
    message: `Cache warmed for type: ${type}`,
    warmed
  })
}

async function invalidatePattern(cache: any, pattern: string) {
  if (!pattern) {
    return NextResponse.json(
      { error: 'Pattern parameter required' },
      { status: 400 }
    )
  }

  const invalidated = await cache.invalidatePattern(pattern)
  
  return NextResponse.json({
    status: 'ok',
    message: `Invalidated ${invalidated} cache entries matching pattern: ${pattern}`,
    invalidated
  })
}

async function resetStats(cache: any) {
  cache.resetStats()
  
  return NextResponse.json({
    status: 'ok',
    message: 'Cache statistics reset'
  })
}

// Export additional utility functions
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const key = searchParams.get('key')
    
    if (!type) {
      return NextResponse.json(
        { error: 'Type parameter required' },
        { status: 400 }
      )
    }

    const cache = getCachingService()
    
    if (key) {
      // Delete specific key
      const deleted = await cache.delete(type as any, key)
      return NextResponse.json({
        status: deleted ? 'ok' : 'not_found',
        message: deleted ? 'Cache entry deleted' : 'Cache entry not found',
        deleted
      })
    } else {
      // Clear entire type
      const cleared = await cache.clearType(type as any)
      return NextResponse.json({
        status: 'ok',
        message: `Cleared ${cleared} cache entries`,
        cleared
      })
    }
  } catch (error) {
    console.error('Cache DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}