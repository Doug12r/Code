import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getPlexService } from '@/lib/plex-service';
import { decryptToken } from '@/lib/encryption';

export async function GET(
  request: NextRequest,
  { params }: { params: { showId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const awaitedParams = await params;
    const showId = awaitedParams.showId;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'seasons'; // 'seasons', 'episodes', or 'all'
    const seasonId = searchParams.get('season');

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

    // Handle different request types
    if (type === 'episodes' && seasonId) {
      // Get episodes for a specific season
      const episodes = await plexService.getSeasonEpisodes(seasonId);
      return NextResponse.json({ 
        type: 'episodes',
        seasonId,
        episodes: episodes.map(episode => ({
          ratingKey: episode.ratingKey,
          key: episode.key,
          title: episode.title,
          summary: episode.summary,
          index: episode.index,
          parentIndex: episode.parentIndex,
          thumb: episode.thumb,
          art: episode.art,
          duration: episode.duration,
          rating: episode.rating,
          year: episode.year,
          originallyAvailableAt: episode.originallyAvailableAt,
          addedAt: episode.addedAt,
          viewCount: episode.viewCount,
          grandparentTitle: episode.grandparentTitle,
          parentTitle: episode.parentTitle
        }))
      });
    } 
    
    if (type === 'all') {
      // Get all episodes across all seasons
      const episodes = await plexService.getShowEpisodes(showId);
      return NextResponse.json({ 
        type: 'all_episodes',
        showId,
        episodes: episodes.map(episode => ({
          ratingKey: episode.ratingKey,
          key: episode.key,
          title: episode.title,
          summary: episode.summary,
          index: episode.index,
          parentIndex: episode.parentIndex,
          thumb: episode.thumb,
          art: episode.art,
          duration: episode.duration,
          rating: episode.rating,
          year: episode.year,
          originallyAvailableAt: episode.originallyAvailableAt,
          addedAt: episode.addedAt,
          viewCount: episode.viewCount,
          grandparentTitle: episode.grandparentTitle,
          parentTitle: episode.parentTitle
        }))
      });
    }
    
    // Default: get seasons
    const seasons = await plexService.getShowSeasons(showId);
    return NextResponse.json({ 
      type: 'seasons',
      showId,
      seasons: seasons.map(season => ({
        ratingKey: season.ratingKey,
        title: season.title,
        summary: season.summary,
        index: season.index,
        thumb: season.thumb,
        art: season.art,
        leafCount: season.leafCount,
        viewedLeafCount: season.viewedLeafCount,
        addedAt: season.addedAt,
        updatedAt: season.updatedAt
      }))
    });

  } catch (error) {
    console.error('Error fetching TV show data:', error);
    
    let errorMessage = 'Failed to fetch TV show data';
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