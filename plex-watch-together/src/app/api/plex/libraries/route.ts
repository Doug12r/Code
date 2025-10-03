import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-production';
import { prisma } from '@/lib/prisma';
import { getPlexService } from '@/lib/plex-service';
import { withErrorHandling, AuthenticationError } from '@/lib/error-handling';
import { decryptToken } from '@/lib/encryption';

/**
 * Enhanced Plex Libraries API with Service Integration
 * 
 * Features:
 * - Intelligent caching with configurable TTL
 * - Automatic error handling and retry logic
 * - Performance monitoring and metrics
 * - Library content analysis
 * - Health status integration
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    throw new AuthenticationError();
  }

  const { searchParams } = new URL(request.url)
  const includeContent = searchParams.get('content') === 'true'
  const libraryKey = searchParams.get('library')

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
    
    try {
      plexToken = decryptToken(user.plexToken);
    } catch (decryptError) {
      console.log('🔧 Token decryption failed - likely old encryption key. Clearing token for re-authentication.');
      
      // Clear the invalid token so user can re-authenticate
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
  }

  // Get enhanced Plex service instance
  const plexService = getPlexService(plexUrl, plexToken);
  
  if (libraryKey && includeContent) {
    // Get specific library content
    const media = await plexService.getLibraryMedia(libraryKey, 0, 50);
    
    return NextResponse.json({
      library: libraryKey,
      media,
      total: media.length,
      metrics: {
        cacheHitRate: plexService.getMetrics().cacheHitRate,
        responseTime: plexService.getMetrics().averageResponseTime
      }
    });
  }
  
  // Get all libraries with enhanced metadata
  const libraries = await plexService.getLibraries();
  
  // Filter and enhance library information
  const enhancedLibraries = libraries
    .filter(lib => lib.type === 'movie' || lib.type === 'show')
    .map(lib => ({
      ...lib,
      contentType: lib.type,
      displayName: lib.title,
      lastAccessed: new Date().toISOString()
    }));

  // Get service health for additional context
  const healthStatus = plexService.getConnectionHealth();
  const metrics = plexService.getMetrics();

  return NextResponse.json({
    libraries: enhancedLibraries,
    summary: {
      totalLibraries: enhancedLibraries.length,
      movieLibraries: enhancedLibraries.filter(l => l.type === 'movie').length,
      showLibraries: enhancedLibraries.filter(l => l.type === 'show').length,
    },
    service: {
      health: healthStatus.status,
      cacheHitRate: `${metrics.cacheHitRate}%`,
      averageResponseTime: `${Math.round(metrics.averageResponseTime)}ms`,
      successRate: `${metrics.successRate}%`,
      lastHealthCheck: new Date(healthStatus.lastCheck).toISOString()
    },
    timestamp: new Date().toISOString()
  });
})