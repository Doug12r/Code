import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { performanceMonitor } from '@/lib/performance-analytics'
import { auditLogger } from '@/lib/monitoring'
import { logger } from '@/lib/structured-logging'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const timeRange = parseInt(searchParams.get('timeRange') || '300000') // Default 5 minutes
    const type = searchParams.get('type') // Optional filter

    // Get aggregated performance metrics
    const performanceMetrics = performanceMonitor.getAggregatedMetrics(timeRange)
    
    // Get recent logs with filters
    const recentLogs = logger.getLogs({
      limit: 100,
      startDate: new Date(Date.now() - timeRange).toISOString()
    })

    // Get audit metrics
    const auditMetrics = auditLogger.getMetrics()

    // Get log statistics
    const logStats = logger.getStats()

    // System health indicators
    const healthIndicators = {
      errorRate: performanceMetrics.summary.errorRate,
      avgResponseTime: performanceMetrics.summary.avgDuration,
      throughput: performanceMetrics.summary.totalOperations,
      logErrors: logStats.recentErrors,
      criticalIssues: recentLogs.filter(log => log.level >= 4).length // Critical logs
    }

    // Performance trends (simplified calculation)
    const trends = calculatePerformanceTrends(timeRange)

    // Real-time metrics for dashboard
    const dashboardData = {
      timestamp: new Date().toISOString(),
      timeRange,
      
      // Performance overview
      performance: {
        summary: performanceMetrics.summary,
        byType: performanceMetrics.byType,
        trends,
        slowest: performanceMetrics.slowest.slice(0, 5),
        health: calculateHealthScore(healthIndicators)
      },

      // Error tracking
      errors: {
        recent: performanceMetrics.errors.slice(0, 10),
        summary: {
          total: performanceMetrics.errors.length,
          rate: performanceMetrics.summary.errorRate,
          distribution: groupErrorsByType(performanceMetrics.errors)
        }
      },

      // System metrics
      system: {
        memory: getMemoryUsage(),
        uptime: process.uptime(),
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development'
      },

      // Audit and security
      audit: {
        metrics: auditMetrics,
        recentEvents: auditLogger.getEvents({ limit: 20 })
      },

      // Logging statistics
      logs: {
        stats: logStats,
        recent: recentLogs.slice(0, 50),
        distribution: logStats.logsByLevel
      },

      // Health indicators
      health: healthIndicators
    }

    return NextResponse.json({
      success: true,
      data: dashboardData
    })

  } catch (error) {
    console.error('Error fetching monitoring data:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch monitoring data'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, data } = body

    switch (action) {
      case 'clear_metrics':
        performanceMonitor.clearMetrics()
        auditLogger.clearEvents()
        
        return NextResponse.json({
          success: true,
          message: 'Metrics cleared'
        })

      case 'export_logs':
        const logs = logger.getLogs({
          startDate: data.startDate,
          endDate: data.endDate,
          level: data.level
        })
        
        return NextResponse.json({
          success: true,
          data: {
            logs,
            count: logs.length,
            exportedAt: new Date().toISOString()
          }
        })

      case 'set_log_level':
        // In production, would update logger configuration
        return NextResponse.json({
          success: true,
          message: `Log level set to ${data.level}`
        })

      default:
        return NextResponse.json({
          error: 'Unknown action',
          validActions: ['clear_metrics', 'export_logs', 'set_log_level']
        }, { status: 400 })
    }

  } catch (error) {
    console.error('Error processing monitoring action:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to process action'
    }, { status: 500 })
  }
}

// Helper functions
function calculatePerformanceTrends(timeRange: number): {
  responseTime: 'improving' | 'degrading' | 'stable'
  errorRate: 'improving' | 'degrading' | 'stable' 
  throughput: 'increasing' | 'decreasing' | 'stable'
} {
  // Simplified trend calculation
  // In production, would compare with historical data
  
  const current = performanceMonitor.getAggregatedMetrics(timeRange)
  const previous = performanceMonitor.getAggregatedMetrics(timeRange * 2)

  const responseTimeTrend = current.summary.avgDuration < previous.summary.avgDuration ? 'improving' : 
                           current.summary.avgDuration > previous.summary.avgDuration ? 'degrading' : 'stable'

  const errorRateTrend = current.summary.errorRate < previous.summary.errorRate ? 'improving' :
                        current.summary.errorRate > previous.summary.errorRate ? 'degrading' : 'stable'

  const throughputTrend = current.summary.totalOperations > previous.summary.totalOperations ? 'increasing' :
                         current.summary.totalOperations < previous.summary.totalOperations ? 'decreasing' : 'stable'

  return {
    responseTime: responseTimeTrend,
    errorRate: errorRateTrend,
    throughput: throughputTrend
  }
}

function calculateHealthScore(indicators: {
  errorRate: number
  avgResponseTime: number
  throughput: number
  logErrors: number
  criticalIssues: number
}): {
  score: number
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
  factors: Record<string, { score: number; impact: 'positive' | 'negative' | 'neutral' }>
} {
  let score = 100
  const factors: Record<string, { score: number; impact: 'positive' | 'negative' | 'neutral' }> = {}

  // Error rate impact (0-5% good, 5-15% fair, >15% poor)
  if (indicators.errorRate <= 5) {
    factors.errorRate = { score: 0, impact: 'positive' }
  } else if (indicators.errorRate <= 15) {
    const penalty = (indicators.errorRate - 5) * 2
    score -= penalty
    factors.errorRate = { score: -penalty, impact: 'negative' }
  } else {
    score -= 30
    factors.errorRate = { score: -30, impact: 'negative' }
  }

  // Response time impact (<200ms excellent, 200-1000ms good, >1000ms poor)
  if (indicators.avgResponseTime < 200) {
    factors.responseTime = { score: 5, impact: 'positive' }
    score += 5
  } else if (indicators.avgResponseTime < 1000) {
    factors.responseTime = { score: 0, impact: 'neutral' }
  } else {
    const penalty = Math.min(20, (indicators.avgResponseTime - 1000) / 100)
    score -= penalty
    factors.responseTime = { score: -penalty, impact: 'negative' }
  }

  // Critical issues impact
  if (indicators.criticalIssues > 0) {
    const penalty = indicators.criticalIssues * 10
    score -= penalty
    factors.criticalIssues = { score: -penalty, impact: 'negative' }
  } else {
    factors.criticalIssues = { score: 0, impact: 'positive' }
  }

  // Recent log errors impact
  if (indicators.logErrors > 10) {
    const penalty = Math.min(15, indicators.logErrors - 10)
    score -= penalty
    factors.logErrors = { score: -penalty, impact: 'negative' }
  } else {
    factors.logErrors = { score: 0, impact: 'neutral' }
  }

  // Throughput impact (bonus for high activity)
  if (indicators.throughput > 100) {
    score += 5
    factors.throughput = { score: 5, impact: 'positive' }
  } else if (indicators.throughput > 50) {
    factors.throughput = { score: 0, impact: 'neutral' }
  } else {
    factors.throughput = { score: 0, impact: 'neutral' }
  }

  score = Math.max(0, Math.min(100, score))

  let status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
  if (score >= 90) status = 'excellent'
  else if (score >= 75) status = 'good'
  else if (score >= 60) status = 'fair'
  else if (score >= 30) status = 'poor'
  else status = 'critical'

  return { score, status, factors }
}

function groupErrorsByType(errors: any[]): Record<string, number> {
  return errors.reduce((acc, error) => {
    const type = error.metadata?.errorType || error.metadata?.type || 'unknown'
    acc[type] = (acc[type] || 0) + 1
    return acc
  }, {} as Record<string, number>)
}

function getMemoryUsage(): {
  heapUsed: number
  heapTotal: number
  external: number
  rss: number
  percentage: number
} {
  const memUsage = process.memoryUsage()
  
  return {
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
    external: Math.round(memUsage.external / 1024 / 1024), // MB
    rss: Math.round(memUsage.rss / 1024 / 1024), // MB
    percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
  }
}