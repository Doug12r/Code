import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // For media streaming, we'll allow access without strict user auth
    // since this is proxying media that users should have access to in their rooms
    const { id } = await params
    const { searchParams } = new URL(request.url)

    // Get Plex server configuration from environment
    const plexUrl = process.env.NODE_ENV === 'production' 
      ? process.env.PLEX_URL_PROD 
      : process.env.PLEX_URL_DEV
    const plexToken = process.env.PLEX_TOKEN

    if (!plexUrl || !plexToken) {
      return NextResponse.json({ 
        error: 'Plex server not configured' 
      }, { status: 400 })
    }

    // Build the stream URL for the media item
    const streamParams = new URLSearchParams({
      'X-Plex-Token': plexToken,
      'X-Plex-Client-Identifier': process.env.PLEX_CLIENT_ID || 'plex-watch-together',
      'X-Plex-Product': 'Plex Watch Together',
      'X-Plex-Version': '1.0.0',
      'X-Plex-Platform': 'Web',
      'X-Plex-Device': 'Browser',
      'X-Plex-Device-Name': 'Web Browser',
      // Pass through any additional parameters
      ...Object.fromEntries(searchParams.entries())
    })

    // For now, return a direct Plex URL redirect
    // This is a temporary solution to get video playback working
    const directStreamUrl = `${plexUrl}/library/metadata/${id}/file.mp4?${streamParams.toString()}`

    // Return a redirect to the Plex server
    return NextResponse.redirect(directStreamUrl, 302)

  } catch (error) {
    console.error('Media streaming error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}