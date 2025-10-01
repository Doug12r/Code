import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { hostname } = await request.json()
    
    if (!hostname) {
      return NextResponse.json({ error: 'Hostname is required' }, { status: 400 })
    }

    console.log(`Testing DNS resolution for: ${hostname}`)
    
    // Test DNS resolution using a simple HTTP request
    const testUrls = [
      `https://${hostname}`,
      `http://${hostname}`,
      `https://${hostname}:32400`,
      `http://${hostname}:32400`
    ]

    const results = []

    for (const url of testUrls) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)
        
        // Use HEAD request to minimize data transfer
        const response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        
        results.push({
          url,
          resolved: true,
          reachable: response.ok,
          status: response.status,
          error: null
        })
      } catch (error) {
        const errorWithCode = error as Error & { code?: string }
        results.push({
          url,
          resolved: errorWithCode.code !== 'EAI_AGAIN' && errorWithCode.code !== 'ENOTFOUND',
          reachable: false,
          status: 0,
          error: errorWithCode.code || (error instanceof Error ? error.message : 'Unknown error')
        })
      }
    }

    const dnsWorking = results.some(r => r.resolved)
    const serverReachable = results.some(r => r.reachable)

    return NextResponse.json({
      hostname,
      dnsResolution: dnsWorking,
      serverReachable,
      results,
      recommendations: generateRecommendations(hostname, dnsWorking, serverReachable)
    })

  } catch (error) {
    console.error('DNS test error:', error)
    return NextResponse.json(
      { error: 'Failed to test DNS resolution' },
      { status: 500 }
    )
  }
}

function generateRecommendations(hostname: string, dnsWorking: boolean, serverReachable: boolean): string[] {
  const recommendations = []

  if (!dnsWorking) {
    recommendations.push(`DNS resolution failed for ${hostname}`)
    if (hostname.includes('.duckdns.org')) {
      recommendations.push('Check DuckDNS service status at https://www.duckdns.org')
      recommendations.push('Verify your DuckDNS domain is active and updated')
      recommendations.push('Try updating your DuckDNS IP address manually')
    }
    recommendations.push('Try using a different DNS server (8.8.8.8, 1.1.1.1)')
    recommendations.push('Check your internet connection')
  } else if (!serverReachable) {
    recommendations.push('DNS resolves but server is not reachable')
    recommendations.push('Check if Plex Media Server is running')
    recommendations.push('Verify port forwarding for port 32400')
    recommendations.push('Check firewall settings')
  } else {
    recommendations.push('DNS and server connectivity appear to be working')
  }

  return recommendations
}