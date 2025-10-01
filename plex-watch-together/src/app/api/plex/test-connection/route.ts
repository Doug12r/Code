import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PlexAPI } from '@/lib/plex-api'

// Enhanced Plex server connectivity testing
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's Plex configuration
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { plexUrl: true, plexToken: true }
    })

    if (!user?.plexUrl || !user?.plexToken) {
      return NextResponse.json({ 
        error: 'Plex server not configured' 
      }, { status: 400 })
    }

    // Decrypt the token
    const plexToken = Buffer.from(user.plexToken, 'base64').toString()

    // Test the configured Plex URL directly
    const results = []
    
    console.log(`Testing Plex connectivity to: ${user.plexUrl}`)
    
    try {
      const plexApi = new PlexAPI(user.plexUrl, plexToken)
      const diagnostics = await plexApi.testConnectionWithDiagnostics()
      
      results.push({
        url: user.plexUrl,
        success: diagnostics.success,
        latency: diagnostics.latency,
        error: diagnostics.error,
        serverInfo: diagnostics.serverInfo
      })
    } catch (error) {
      results.push({
        url: user.plexUrl,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
    
    const workingConnection = results.find(r => r.success)
    
    return NextResponse.json({ 
      results,
      recommendation: workingConnection ? {
        message: 'Connection successful',
        bestUrl: workingConnection.url,
        latency: workingConnection.latency
      } : {
        message: 'All connection attempts failed. Check if Plex server is online and accessible.',
        suggestions: [
          'Verify Plex server is running',
          'Check network connectivity to ' + user.plexUrl,
          'Confirm port forwarding (32400)',
          'Try accessing Plex Web UI directly',
          'Check if Dynamic DNS is resolving correctly'
        ]
      }
    })
  } catch (error) {
    console.error('Connection test error:', error)
    return NextResponse.json(
      { error: 'Failed to test Plex connection' },
      { status: 500 }
    )
  }
}