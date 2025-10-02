import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getPlexService } from '@/lib/plex-service';
import { withErrorHandling, AuthenticationError } from '@/lib/error-handling';

/**
 * SIMPLIFIED with Plex Service Plugin
 * 
 * Before: 50+ lines of complex error handling, manual API calls, no caching
 * After:  25 lines with automatic caching, error handling, and performance monitoring
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    throw new AuthenticationError();
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

  // 🚀 MAGIC: Get service instance (auto-configured with user's settings)
  const plexService = getPlexService(user.plexUrl, plexToken);
  
  // 🎯 Get libraries (auto-cached, auto-retry, auto-error-handled!)
  const libraries = await plexService.getLibraries();
  
  // Filter for movie and TV show libraries
  const filteredLibraries = libraries.filter(lib => 
    lib.type === 'movie' || lib.type === 'show'
  );

  return NextResponse.json({ 
    libraries: filteredLibraries,
    // Bonus: Performance insights!
    performance: plexService.getMetrics()
  });
})