import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getPlexService } from '@/lib/plex-service';
import { decryptToken } from '@/lib/encryption';

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
        error: 'Plex server not configured. Please set up your Plex connection first.',
        setupUrl: '/api/plex/setup'
      }, { status: 400 });
    }

    // Decrypt the token using proper encryption service
    let plexToken: string;
    try {
      plexToken = decryptToken(user.plexToken);
    } catch (decryptError) {
      console.log('🔧 Token decryption failed - clearing for re-authentication');
      
      // Clear the invalid token
      await prisma.user.update({
        where: { email: session.user.email },
        data: { 
          plexToken: null,
          plexUrl: null,
          plexUsername: null,
          plexServerId: null
        }
      });
      
      return NextResponse.json({ 
        error: 'Plex authentication expired. Please reconnect your Plex account.',
        requiresReauth: true,
        setupUrl: '/api/plex/setup'
      }, { status: 401 });
    }

    // Use enhanced Plex service
    const plexService = getPlexService(user.plexUrl, plexToken);
    
    // Add retry logic for network reliability
    let mediaData;
    let lastError;
    
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Attempting to get library content (attempt ${attempt}/2)`);
        mediaData = await plexService.getLibraryMedia(libraryId, 0, 50);
        break; // Success, exit retry loop
      } catch (error) {
        lastError = error;
        console.error(`Library content attempt ${attempt} failed:`, error);
        
        // If first attempt failed, wait before retry
        if (attempt === 1) {
          console.log('Retrying in 2 seconds...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    // If all attempts failed, throw the last error
    if (!mediaData) {
      throw lastError;
    }
    
    // mediaData is already an array of PlexMedia objects from getLibraryMedia
    const media = mediaData.map((item: any) => ({
      ratingKey: item.ratingKey,
      key: item.key,
      guid: item.guid,
      type: item.type,
      title: item.title,
      titleSort: item.titleSort,
      summary: item.summary,
      rating: item.rating,
      audienceRating: item.audienceRating,
      year: item.year,
      tagline: item.tagline,
      thumb: item.thumb,
      art: item.art,
      duration: item.duration,
      originallyAvailableAt: item.originallyAvailableAt,
      addedAt: item.addedAt,
      updatedAt: item.updatedAt,
      studio: item.studio,
      contentRating: item.contentRating,
      genres: item.Genre?.map((g: any) => g.tag) || [],
      directors: item.Director?.map((d: any) => d.tag) || [],
      writers: item.Writer?.map((w: any) => w.tag) || [],
      producers: item.Producer?.map((p: any) => p.tag) || [],
      countries: item.Country?.map((c: any) => c.tag) || [],
      roles: item.Role?.slice(0, 5).map((r: any) => ({
        tag: r.tag,
        role: r.role,
        thumb: r.thumb
      })) || [],
      // For TV shows
      leafCount: item.leafCount,
      viewedLeafCount: item.viewedLeafCount,
      childCount: item.childCount,
      // For movies  
      chapterSource: item.chapterSource,
      // Media info
      media: item.Media?.map((m: any) => ({
        id: m.id,
        duration: m.duration,
        bitrate: m.bitrate,
        width: m.width,
        height: m.height,
        aspectRatio: m.aspectRatio,
        audioChannels: m.audioChannels,
        audioCodec: m.audioCodec,
        videoCodec: m.videoCodec,
        videoResolution: m.videoResolution,
        container: m.container,
        videoFrameRate: m.videoFrameRate,
        optimizedForStreaming: m.optimizedForStreaming,
        audioProfile: m.audioProfile,
        has64bitOffsets: m.has64bitOffsets,
        videoProfile: m.videoProfile
      })) || []
    }));

    return NextResponse.json({ 
      media,
      libraryId,
      total: media.length,
      size: media.length,
      totalSize: media.length,
      offset: 0
    });

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