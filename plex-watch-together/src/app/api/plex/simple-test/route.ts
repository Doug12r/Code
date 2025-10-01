import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { url, timeout = 15000 } = await request.json()
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    console.log(`Simple connection test to: ${url} (timeout: ${timeout}ms)`)
    
    const startTime = Date.now()
    
    // Simple fetch with Promise.race timeout
    const fetchPromise = fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Plex-Watch-Together/1.0'
      }
    })
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout after ${timeout}ms`))
      }, timeout)
    })

    try {
      const response = await Promise.race([fetchPromise, timeoutPromise])
      const latency = Date.now() - startTime
      
      console.log(`Simple test completed: ${response.status} in ${latency}ms`)
      
      return NextResponse.json({
        success: true,
        status: response.status,
        statusText: response.statusText,
        latency,
        headers: Object.fromEntries(response.headers.entries())
      })
      
    } catch (error) {
      const latency = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      console.log(`Simple test failed: ${errorMessage} after ${latency}ms`)
      
      return NextResponse.json({
        success: false,
        error: errorMessage,
        latency,
        timeout: latency >= timeout
      })
    }
    
  } catch (error) {
    console.error('Simple test API error:', error)
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    )
  }
}