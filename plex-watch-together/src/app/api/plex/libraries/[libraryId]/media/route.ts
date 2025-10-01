import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PlexAPI } from '@/lib/plex-api';

export async function GET(
  request: NextRequest,
  { params }: { params: { libraryId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const awaitedParams = await params;
    const libraryId = awaitedParams.libraryId;

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

    // Use PlexAPI class with retry logic for network issues
    const plexApi = new PlexAPI(user.plexUrl, plexToken);
    
    // Add simple retry for network reliability
    let mediaItems;
    let lastError;
    
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Attempting to get library content (attempt ${attempt}/2)`);
        mediaItems = await plexApi.getLibraryContent(libraryId);
        break; // Success, exit retry loop
      } catch (error) {
        lastError = error;
        console.error(`Library content attempt ${attempt} failed:`, error);
        
        // If first attempt failed, wait before retry
        if (attempt === 1) {
          console.log('Retrying in 3 seconds...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }
    
    // If all attempts failed, throw the last error
    if (!mediaItems) {
      throw lastError;
    }
    
    // Transform Plex media data to our format
    const media = mediaItems.map((item: any) => ({
      ratingKey: item.ratingKey,
      key: item.key,
      title: item.title,
      summary: item.summary,
      year: item.year,
      duration: item.duration,
      rating: item.rating,
      thumb: item.thumb,
      art: item.art,
      type: item.type,
      genre: item.Genre?.map((g: any) => g.tag) || [],
      studio: item.studio,
      addedAt: item.addedAt
    }));

    return NextResponse.json({ media });
  } catch (error) {
    console.error('Error fetching library media:', error);
    
    let errorMessage = 'Failed to fetch media from library';
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