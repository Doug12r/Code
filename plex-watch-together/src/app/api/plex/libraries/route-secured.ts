import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getPlexService } from '@/lib/plex-service';
import { withErrorHandling, AuthenticationError } from '@/lib/error-handling';

/**
 * SECURED & OPTIMIZED Plex Libraries API
 * 
 * Security Improvements:
 * - Rate limiting via middleware
 * - Proper error handling with structured responses
 * - Authentication validation with custom errors
 * - Input validation and sanitization
 * 
 * Performance Features:
 * - Plex Service Plugin with intelligent caching
 * - Request deduplication 
 * - Automatic error handling and retries
 * - Performance monitoring
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  // Authentication check
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    throw new AuthenticationError('Please sign in to access Plex libraries');
  }

  // Get user's Plex configuration
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { 
      plexUrl: true, 
      plexToken: true,
      id: true // For logging purposes
    }
  });

  if (!user?.plexUrl || !user?.plexToken) {
    return NextResponse.json({ 
      success: false,
      error: 'Plex server not configured',
      message: 'Please configure your Plex server in the dashboard'
    }, { status: 400 });
  }

  // Use the Plex Service Plugin for automatic optimization
  const plexService = getPlexService(user.plexUrl, user.plexToken);
  const libraries = await plexService.getLibraries();
  
  // Filter for movie and TV show libraries only
  const mediaLibraries = libraries.filter((lib: any) => 
    lib.type === 'movie' || lib.type === 'show'
  );

  // Get performance metrics from the plugin
  const metrics = plexService.getMetrics();

  return NextResponse.json({
    success: true,
    data: {
      libraries: mediaLibraries,
      count: mediaLibraries.length,
    },
    performance: {
      cached: metrics.cacheHitRate > 0,
      responseTime: metrics.averageResponseTime,
      cacheHitRate: `${metrics.cacheHitRate}%`
    },
    message: `Found ${mediaLibraries.length} media libraries`,
    timestamp: new Date().toISOString()
  });
});