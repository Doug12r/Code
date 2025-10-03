import { NextRequest, NextResponse } from 'next/server'

export async function HEAD() {
  // Simple ping endpoint for latency measurement
  return new NextResponse(null, { 
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  })
}

export async function GET() {
  // Also support GET for ping
  return NextResponse.json({ 
    timestamp: Date.now(),
    message: 'pong' 
  }, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  })
}