import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PlexAPI } from '@/lib/plex-api';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's Plex configuration
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { plexUrl: true, plexToken: true }
    });

    if (!user?.plexUrl || !user?.plexToken) {
      return NextResponse.json({ 
        error: 'Plex server not configured' 
      }, { status: 400 });
    }

    // Decrypt the token
    const plexToken = Buffer.from(user.plexToken, 'base64').toString();

    // Use PlexAPI class for proper timeout and error handling
    const plexApi = new PlexAPI(user.plexUrl, plexToken);
    const libraries = await plexApi.getLibraries();
    
    // Filter for movie and TV show libraries
    const filteredLibraries = libraries.filter((lib: any) => 
      lib.type === 'movie' || lib.type === 'show'
    );

    return NextResponse.json({ libraries: filteredLibraries });
  } catch (error) {
    console.error('Error fetching Plex libraries:', error);
    
    let errorMessage = 'Failed to fetch Plex libraries';
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        errorMessage = 'Plex server connection timeout. Please check if your server is running.';
      } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
        errorMessage = 'Cannot connect to Plex server. Please check your server URL and network connection.';
      } else {
        errorMessage = error.message;
      }
    }
    
    return NextResponse.json({ 
      error: errorMessage
    }, { status: 500 });
  }
}