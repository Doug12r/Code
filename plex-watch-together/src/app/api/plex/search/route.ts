import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-production';
import { prisma } from '@/lib/prisma';
import { getPlexService } from '@/lib/plex-service';
import { decryptToken } from '@/lib/encryption';
import { withErrorHandling, AuthenticationError } from '@/lib/error-handling';

/**
 * Enhanced Plex Search API with Service Integration
 * 
 * Features:
 * - Intelligent search with performance tracking
 * - Search result caching and optimization
 * - Enhanced error handling and retry logic
 * - Search analytics and metrics
 * - Content type filtering
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    throw new AuthenticationError();
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const type = searchParams.get('type'); // movie, show, all
  const limit = parseInt(searchParams.get('limit') || '50');

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ 
      error: 'Search query must be at least 2 characters' 
    }, { status: 400 });
  }

  // Get user's Plex configuration from environment or database
  let plexUrl = process.env.PLEX_BASE_URL;
  let plexToken = process.env.PLEX_TOKEN;

  // If not in environment, check user profile
  if (!plexUrl || !plexToken) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { plexUrl: true, plexToken: true }
    });

    if (!user?.plexUrl || !user?.plexToken) {
      return NextResponse.json({ 
        error: 'Plex server not configured. Please configure in environment variables or user profile.' 
      }, { status: 400 });
    }

    plexUrl = user.plexUrl;
    plexToken = decryptToken(user.plexToken);
  }

  // Get enhanced Plex service instance
  const plexService = getPlexService(plexUrl, plexToken);
  
  const searchStartTime = Date.now();
  
  // Perform search with service (includes automatic error handling)
  const searchResults = await plexService.searchMedia(query.trim());
  
  const searchTime = Date.now() - searchStartTime;
  
  // Transform and filter search results
  let results = searchResults.map((item: any) => ({
    ratingKey: item.ratingKey,
    key: item.key,
    title: item.title,
    summary: item.summary || '',
    year: item.year || 0,
    duration: item.duration || 0,
    rating: item.rating || 0,
    thumb: item.thumb,
    art: item.art,
    type: item.type,
    genre: item.Genre?.map((g: any) => g.tag) || [],
    studio: item.studio || '',
    addedAt: item.addedAt,
    // Enhanced metadata
    contentType: item.type === 'movie' ? 'Movie' : item.type === 'show' ? 'TV Show' : item.type,
    searchScore: calculateSearchScore(item, query),
    lastAccessed: new Date().toISOString()
  }));

  // Filter by content type if specified
  if (type && type !== 'all') {
    results = results.filter(item => item.type === type);
  }

  // Sort by search relevance and limit results
  results = results
    .sort((a, b) => b.searchScore - a.searchScore)
    .slice(0, limit);

  // Get service metrics for performance insights
  const metrics = plexService.getMetrics();

  return NextResponse.json({
    query: query.trim(),
    results,
    summary: {
      totalResults: results.length,
      searchTime: `${searchTime}ms`,
      movieResults: results.filter(r => r.type === 'movie').length,
      showResults: results.filter(r => r.type === 'show').length,
      filter: type || 'all'
    },
    service: {
      cacheHitRate: `${metrics.cacheHitRate}%`,
      averageResponseTime: `${Math.round(metrics.averageResponseTime)}ms`,
      successRate: `${metrics.successRate}%`
    },
    timestamp: new Date().toISOString()
  });
})

/**
 * Calculate search relevance score
 */
function calculateSearchScore(item: any, query: string): number {
  const searchTerms = query.toLowerCase().split(' ');
  let score = 0;

  const title = (item.title || '').toLowerCase();
  const summary = (item.summary || '').toLowerCase();

  // Exact title match gets highest score
  if (title === query.toLowerCase()) {
    score += 100;
  }

  // Title contains all search terms
  if (searchTerms.every(term => title.includes(term))) {
    score += 50;
  }

  // Title contains some search terms
  searchTerms.forEach(term => {
    if (title.includes(term)) {
      score += 20;
    }
    if (summary.includes(term)) {
      score += 5;
    }
  });

  // Boost score for recent content
  if (item.year && item.year > new Date().getFullYear() - 5) {
    score += 10;
  }

  // Boost score for highly rated content
  if (item.rating && item.rating > 8) {
    score += 15;
  }

  return score;
}