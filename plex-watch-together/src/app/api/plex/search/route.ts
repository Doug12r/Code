import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PlexAPI } from '@/lib/plex-api';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) {
      return NextResponse.json({ 
        error: 'Search query is required' 
      }, { status: 400 });
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
    const searchResults = await plexApi.search(query);
    
    // Transform search results to our format
    const results = searchResults.map((item: any) => ({
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

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Error searching Plex media:', error);
    return NextResponse.json({ 
      error: 'Failed to search media' 
    }, { status: 500 });
  }
}