import { NextRequest, NextResponse } from 'next/server'
import { getPlexService } from '@/lib/plex-service'

/**
 * BEFORE (Complex): Direct PlexAPI usage with manual error handling
 * 
 * const plexAPI = new PlexAPI(baseUrl, token)
 * try {
 *   const libraries = await plexAPI.getLibraries()
 *   // Handle caching manually
 *   // Handle errors manually  
 *   // Handle retries manually
 *   // Handle deduplication manually
 *   return NextResponse.json(libraries)
 * } catch (error) {
 *   // Complex error handling
 *   return NextResponse.json({ error }, { status: 500 })
 * }
 */

/**
 * AFTER (Simple): Plex Service Plugin usage
 */
export async function GET() {
  try {
    // Get the service instance (automatically configured)
    const plexService = getPlexService()
    
    // Get libraries (automatically cached, deduplicated, error-handled)
    const libraries = await plexService.getLibraries()
    
    return NextResponse.json({
      libraries,
      metrics: plexService.getMetrics() // Bonus: performance insights
    })
    
  } catch (error) {
    console.error('Libraries API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch libraries' },
      { status: 500 }
    )
  }
}

/**
 * Get specific library media with intelligent caching
 */
export async function POST(request: NextRequest) {
  try {
    const { libraryKey, start = 0, size = 50 } = await request.json()
    
    if (!libraryKey) {
      return NextResponse.json(
        { error: 'libraryKey is required' },
        { status: 400 }
      )
    }
    
    const plexService = getPlexService()
    
    // Get library media (cached for 2 minutes, deduplicated automatically)
    const media = await plexService.getLibraryMedia(libraryKey, start, size)
    
    return NextResponse.json({
      media,
      count: media.length,
      pagination: { start, size },
      cached: plexService.getMetrics().cacheHitRate > 0 // Was this cached?
    })
    
  } catch (error) {
    console.error('Library media API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch library media' },
      { status: 500 }
    )
  }
}