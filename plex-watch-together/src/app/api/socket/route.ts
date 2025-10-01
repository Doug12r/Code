import { NextRequest } from 'next/server'
import { Server as NetServer } from 'http'
import { initializeSocketIO, SocketIONextApiResponse } from '@/lib/socket'

export async function GET(_req: NextRequest) {
  return new Response('Socket.IO server is running', { status: 200 })
}

// This will be called by Next.js when the API route is hit
export const config = {
  api: {
    bodyParser: false,
  },
}

// Socket.IO handler function
export function SocketHandler(req: unknown, res: SocketIONextApiResponse) {
  if (!res.socket.server.io) {
    console.log('Initializing Socket.IO server...')
    
    const httpServer: NetServer = res.socket.server
    const io = initializeSocketIO(httpServer)
    
    res.socket.server.io = io
  } else {
    console.log('Socket.IO server already running')
  }
  
  res.end()
}