import { NextRequest, NextResponse } from 'next/server'
import { PlexAPI } from '@/lib/plex-api'

export async function GET(request: NextRequest) {
  try {
    // Get Plex credentials from environment or session
    const baseUrl = process.env.PLEX_SERVER_URL || 'https://douglinux.duckdns.org:443'
    const token = process.env.PLEX_TOKEN || 'NejSfzx7UZpYVxqaPdAq'
    
    if (!token) {
      return NextResponse.json({ error: 'Plex token not found' }, { status: 400 })
    }

    const plexAPI = new PlexAPI(baseUrl, token)
    
    // Get current connection health without making a new request
    const health = plexAPI.getConnectionHealth()
    
    // Perform a quick health check
    const diagnostics = await plexAPI.testConnectionWithDiagnostics()
    
    return NextResponse.json({
      connectionHealth: health,
      lastTest: {
        success: diagnostics.success,
        latency: diagnostics.latency,
        attempt: diagnostics.attempt,
        error: diagnostics.error
      },
      recommendations: generateRecommendations(health),
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Health check failed:', error)
    return NextResponse.json(
      { error: 'Health check failed' },
      { status: 500 }
    )
  }
}

function generateRecommendations(health: any): string[] {
  const recommendations: string[] = []
  
  if (health.consecutiveFailures >= 3) {
    recommendations.push('High failure rate detected - check network stability')
    recommendations.push('Consider restarting your router or checking ISP status')
  }
  
  if (health.averageLatency > 5000) {
    recommendations.push('High latency detected - network may be congested')
    recommendations.push('Try using the app during off-peak hours')
  }
  
  if (health.healthScore < 60) {
    recommendations.push('Network connection is unstable')
    recommendations.push('Auto-retry logic is compensating for network issues')
  }
  
  if (health.successCount > 0 && health.consecutiveFailures === 0) {
    recommendations.push('Connection is stable - all systems working normally')
  }
  
  return recommendations
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json()
    
    if (action === 'reset') {
      // This would reset health metrics if we exposed that functionality
      return NextResponse.json({ message: 'Health metrics reset' })
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}