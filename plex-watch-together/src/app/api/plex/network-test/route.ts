import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { hostname, ports = [32400, 443, 80, 8920, 9090] } = await request.json()
    
    if (!hostname) {
      return NextResponse.json({ error: 'Hostname is required' }, { status: 400 })
    }

    console.log(`Testing network connectivity to: ${hostname}`)
    
    const results = []
    
    // Test different protocols and ports
    for (const port of ports) {
      for (const protocol of ['https', 'http']) {
        const url = `${protocol}://${hostname}:${port}`
        
        try {
          console.log(`Testing: ${url}`)
          
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 10000)
          
          const startTime = Date.now()
          const response = await fetch(url, {
            method: 'HEAD', // Minimal request
            signal: controller.signal,
            headers: {
              'User-Agent': 'Plex-Watch-Together-Test/1.0'
            }
          })
          
          clearTimeout(timeoutId)
          const latency = Date.now() - startTime
          
          results.push({
            url,
            success: true,
            status: response.status,
            latency,
            headers: Object.fromEntries(response.headers.entries())
          })
          
        } catch (error) {
          const latency = Date.now() - performance.now()
          const errorWithCode = error as Error & { code?: string }
          
          results.push({
            url,
            success: false,
            error: errorWithCode.code || (error instanceof Error ? error.message : 'Unknown error'),
            latency
          })
        }
      }
    }
    
    // Analyze results
    const successfulConnections = results.filter(r => r.success)
    const failedConnections = results.filter(r => !r.success)
    
    const analysis = {
      totalTests: results.length,
      successful: successfulConnections.length,
      failed: failedConnections.length,
      fastestConnection: successfulConnections.length > 0 
        ? successfulConnections.reduce((fastest, current) => 
            current.latency < fastest.latency ? current : fastest
          )
        : null,
      commonErrors: [...new Set(failedConnections.map(f => f.error))],
      recommendations: generateNetworkRecommendations(results, hostname)
    }

    return NextResponse.json({
      hostname,
      results,
      analysis
    })

  } catch (error) {
    console.error('Network connectivity test error:', error)
    return NextResponse.json(
      { error: 'Failed to test network connectivity' },
      { status: 500 }
    )
  }
}

function generateNetworkRecommendations(results: any[], hostname: string): string[] {
  const recommendations = []
  const successfulConnections = results.filter(r => r.success)
  const failedConnections = results.filter(r => !r.success)
  
  if (successfulConnections.length === 0) {
    recommendations.push(`No successful connections to ${hostname}`)
    recommendations.push('Check if the hostname resolves correctly')
    recommendations.push('Verify the server is online and accessible')
  } else {
    const workingPorts = [...new Set(successfulConnections.map(r => {
      const url = new URL(r.url)
      return url.port || (url.protocol === 'https:' ? '443' : '80')
    }))]
    
    recommendations.push(`Working ports found: ${workingPorts.join(', ')}`)
    
    const fastestConnection = successfulConnections.reduce((fastest, current) => 
      current.latency < fastest.latency ? current : fastest
    )
    recommendations.push(`Fastest connection: ${fastestConnection.url} (${fastestConnection.latency}ms)`)
  }
  
  // Check for specific error patterns
  const dnsErrors = failedConnections.filter(f => f.error?.includes('ENOTFOUND') || f.error?.includes('EAI_AGAIN'))
  const connectionRefused = failedConnections.filter(f => f.error?.includes('ECONNREFUSED'))
  const timeouts = failedConnections.filter(f => f.error?.includes('timeout') || f.error?.includes('AbortError'))
  
  if (dnsErrors.length > 0) {
    recommendations.push('DNS resolution issues detected - check DuckDNS status')
  }
  
  if (connectionRefused.length > 0) {
    recommendations.push('Connection refused errors - server may not be listening on those ports')
  }
  
  if (timeouts.length > 0) {
    recommendations.push('Timeout errors - network or server performance issues')
  }
  
  return recommendations
}