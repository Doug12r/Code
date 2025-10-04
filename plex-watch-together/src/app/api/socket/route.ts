import { NextRequest, NextResponse } from 'next/server'

export async function GET(_req: NextRequest) {
  // Socket.IO server status check
  console.log('🔌 Socket.IO status check')
  
  // In production, Socket.IO runs on the custom server (server.js)
  // This endpoint provides status information about the Socket.IO server
  
  try {
    // Check if Socket.IO server is accessible
    const socketUrl = process.env.SOCKET_URL || `http://localhost:${process.env.PORT || 3000}`
    
    // Attempt to check server health
    const response = await fetch(`${socketUrl}/socket.io/`, {
      method: 'GET',
      headers: { 'Accept': 'text/plain' }
    }).catch(() => null)
    
    if (response && response.ok) {
      return NextResponse.json({ 
        status: 'running',
        message: 'Socket.IO server is active',
        endpoint: `${socketUrl}/socket.io/`,
        transport: 'websocket'
      })
    } else {
      return NextResponse.json({ 
        status: 'unavailable',
        message: 'Socket.IO server not accessible - ensure server.js is running',
        endpoint: `${socketUrl}/socket.io/`
      }, { status: 503 })
    }
  } catch (error) {
    return NextResponse.json({ 
      status: 'error',
      message: 'Failed to check Socket.IO server status',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(_req: NextRequest) {
  // Socket.IO server management endpoint
  console.log('🚀 Socket.IO server management request')
  
  // In production, Socket.IO server lifecycle is managed by server.js
  // This endpoint can be used for health checks or restart requests
  
  return NextResponse.json({ 
    status: 'managed_externally',
    message: 'Socket.IO server is managed by server.js process',
    note: 'Use PM2 or process manager to restart the server if needed'
  })
}