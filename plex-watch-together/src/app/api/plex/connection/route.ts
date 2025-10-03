import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptToken } from '@/lib/encryption'
import { getPlexService } from '@/lib/plex-service'

export async function GET(req: NextRequest) {
  try {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user's current Plex connection
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      plexUrl: true,
      plexToken: true,
      plexUsername: true,
      plexServerId: true
    }
  })

  if (!user?.plexUrl || !user?.plexToken) {
    return NextResponse.json({
      connected: false,
      status: 'needs-setup',
      message: 'Plex not configured. Please set up your Plex connection.',
      setupUrl: '/api/plex/setup'
    })
  }

  try {
    // Test the connection
    const decryptedToken = decryptToken(user.plexToken)
    const plexService = getPlexService(user.plexUrl, decryptedToken)
    const libraries = await plexService.getLibraries()

    return NextResponse.json({
      connected: true,
      status: 'connected',
      connection: {
        url: user.plexUrl,
        username: user.plexUsername,
        serverId: user.plexServerId,
        libraryCount: libraries.length,
        libraries: libraries.slice(0, 5).map(lib => ({
          key: lib.key,
          title: lib.title,
          type: lib.type
        }))
      },
      message: `Connected to Plex server with ${libraries.length} libraries`
    })

  } catch (error) {
    // If decryption fails, clear the token
    if (error instanceof Error && error.message.includes('decrypt')) {
      await prisma.user.update({
        where: { email: session.user.email },
        data: { plexToken: null }
      })

      return NextResponse.json({
        connected: false,
        status: 'token-expired',
        message: 'Plex authentication expired. Please reconnect.',
        setupUrl: '/api/plex/setup'
      })
    }

    return NextResponse.json({
      connected: false,
      status: 'connection-error',
      error: error instanceof Error ? error.message : 'Connection failed',
      message: 'Cannot connect to Plex server. Please check your server status.',
      setupUrl: '/api/plex/setup'
    })
  }
  } catch (error) {
    console.error('Connection API error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      message: 'Failed to check connection status'
    }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Clear user's Plex connection
  await prisma.user.update({
    where: { email: session.user.email },
    data: {
      plexToken: null,
      plexUrl: null,
      plexUsername: null,
      plexServerId: null
    }
  })

  return NextResponse.json({
    success: true,
    message: 'Plex connection cleared. You can now set up a new connection.'
  })
  } catch (error) {
    console.error('Delete connection error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      message: 'Failed to clear connection'
    }, { status: 500 })
  }
}