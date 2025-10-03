import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Return the Plex claim URL and instructions
    return NextResponse.json({
      success: true,
      claimUrl: 'https://plex.tv/claim',
      instructions: [
        'Visit plex.tv/claim in a new tab',
        'Sign in to your Plex account if needed',
        'Copy the 4-character claim code that appears',
        'Come back and paste it in the setup form',
        'The code expires in 4 minutes'
      ],
      message: 'Get your Plex claim token from plex.tv/claim'
    })

  } catch (error) {
    console.error('Claim URL error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      message: 'Failed to get claim instructions'
    }, { status: 500 })
  }
}