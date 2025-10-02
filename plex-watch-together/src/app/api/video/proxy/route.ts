import { NextRequest } from 'next/server'
import { PlexAPI } from '@/lib/plex-api'
import { VideoTranscoder } from '@/lib/transcoding'
import { promises as fs } from 'fs'

const plexApi = new PlexAPI(
  process.env.PLEX_BASE_URL || 'http://localhost:32400',
  process.env.PLEX_TOKEN || ''
);

// Track active transcoding sessions
const activeTranscodeSessions = new Map<string, {
  process: any;
  lastAccessed: number;
  cleanup: () => void;
}>();

// Cleanup stale sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  const staleTimeout = 5 * 60 * 1000; // 5 minutes
  
  for (const [sessionId, session] of activeTranscodeSessions.entries()) {
    if (now - session.lastAccessed > staleTimeout) {
      console.log(`🧹 Cleaning up stale transcoding session: ${sessionId}`);
      session.cleanup();
      activeTranscodeSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const key = searchParams.get('key');
  const sessionId = searchParams.get('session') || `session-${Date.now()}-${Math.random()}`;
  
  if (!key) {
    return new Response('Missing key parameter', { status: 400 });
  }

  // Extract rating key from full path like "/library/metadata/19" -> "19"
  const ratingKey = key.replace(/^\/library\/metadata\//, '');
  
  try {
    console.log(`🎬 Video proxy request for key: ${key} (ratingKey: ${ratingKey}, session: ${sessionId})`);

    // Method 1: Try HLS transcoding first (fastest for compatible videos)
    try {
      const hlsUrl = plexApi.getTranscodeUrl(ratingKey);
      const hlsResponse = await fetch(hlsUrl, {
        headers: {
          'X-Plex-Token': process.env.PLEX_TOKEN || ''
        }
      });

      if (hlsResponse.ok && hlsResponse.body) {
        console.log(`🎬 HLS streaming successful for ratingKey: ${ratingKey}`);
        
        // Stream HLS response directly (no buffering)
        return new Response(hlsResponse.body, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
          }
        });
      }
    } catch (hlsError) {
      console.log(`🎬 HLS failed, trying direct stream: ${hlsError}`);
    }

    // Method 2: Try direct stream (good compatibility, STREAMING)
    try {
      const mediaDetails = await plexApi.getMediaDetails(ratingKey);
      if (mediaDetails?.Media?.[0]?.Part?.[0]?.key) {
        const streamUrl = plexApi.getStreamUrl(ratingKey, mediaDetails.Media[0].Part[0].key);
        console.log(`🎬 Starting direct stream from: ${streamUrl}`);
        
        const streamResponse = await fetch(streamUrl, {
          headers: {
            'X-Plex-Token': process.env.PLEX_TOKEN || ''
          }
        });

        if (streamResponse.ok && streamResponse.body) {
          console.log(`🎬 Direct streaming successful for ratingKey: ${ratingKey} - streaming ${streamResponse.headers.get('content-length')} bytes`);
          
          // Get original headers from Plex
          const originalContentType = streamResponse.headers.get('content-type') || 'video/mp4';
          const contentLength = streamResponse.headers.get('content-length');
          const acceptRanges = streamResponse.headers.get('accept-ranges') || 'bytes';
          
          // 🔧 FIX: Force MP4 content-type for browser compatibility
          // MKV/Matroska files need to be transcoded, not direct streamed
          if (originalContentType.includes('matroska') || originalContentType.includes('mkv')) {
            console.log(`🎬 Detected MKV/Matroska format (${originalContentType}), switching to FFmpeg transcoding...`);
            // Don't return here, let it fall through to FFmpeg transcoding
            throw new Error('MKV format detected, needs transcoding');
          }
          
          // Force MP4 content-type for better browser compatibility
          const contentType = 'video/mp4';
          
          const responseHeaders: HeadersInit = {
            'Content-Type': contentType,
            'Accept-Ranges': acceptRanges,
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
          };
          
          // Preserve content-length if available
          if (contentLength) {
            responseHeaders['Content-Length'] = contentLength;
          }
          
          console.log(`🎬 Streaming with Content-Type: ${contentType} (original: ${originalContentType})`);
          
          // Stream the response directly (no buffering)
          return new Response(streamResponse.body, {
            status: 200,
            headers: responseHeaders
          });
        }
      }
    } catch (streamError) {
      console.log(`🎬 Direct stream failed, trying FFmpeg transcoding: ${streamError}`);
    }

    // Method 3: Server-side FFmpeg transcoding with session management
    try {
      const mediaDetails = await plexApi.getMediaDetails(ratingKey);
      if (!mediaDetails?.Media?.[0]?.Part?.[0]?.file) {
        throw new Error('Could not get file path for media');
      }

      const filePath = mediaDetails.Media[0].Part[0].file;
      console.log(`🎬 Starting FFmpeg transcoding for: ${filePath} (session: ${sessionId})`);

      // Verify file exists
      try {
        await fs.access(filePath);
      } catch (accessError) {
        throw new Error(`File not accessible: ${filePath}`);
      }

      // Check if we already have a transcoding session for this content
      const existingSession = activeTranscodeSessions.get(`${ratingKey}-${sessionId}`);
      if (existingSession) {
        existingSession.lastAccessed = Date.now();
        console.log(`🔄 Reusing existing transcoding session: ${sessionId}`);
      }

      let controllerClosed = false;
      let transcodeProcess: any = null;

      const stream = new ReadableStream({
        start(controller) {
          // Create transcoding process using our library
          transcodeProcess = VideoTranscoder.createStreamingTranscode({
            inputPath: filePath,
            outputFormat: 'mp4',
            quality: 'medium',
            maxWidth: 1920,
            maxHeight: 1080
          }, sessionId);

          // Register session cleanup function
          const cleanup = () => {
            if (transcodeProcess && !transcodeProcess.killed) {
              console.log(`🧹 Stopping transcoding session: ${sessionId}`);
              transcodeProcess.kill('SIGTERM');
              transcodeProcess = null;
            }
          };

          // Track this session
          activeTranscodeSessions.set(`${ratingKey}-${sessionId}`, {
            process: transcodeProcess,
            lastAccessed: Date.now(),
            cleanup
          });

          transcodeProcess.stdout!.on('data', (chunk: any) => {
            // Update last accessed time
            const session = activeTranscodeSessions.get(`${ratingKey}-${sessionId}`);
            if (session) {
              session.lastAccessed = Date.now();
            }

            if (!controllerClosed) {
              try {
                controller.enqueue(chunk);
              } catch (error) {
                console.log('🎬 Controller already closed, ignoring chunk');
                controllerClosed = true;
                cleanup();
              }
            }
          });
          
          transcodeProcess.stderr!.on('data', (data: any) => {
            const message = data.toString();
            if (message.includes('frame=') || message.includes('time=')) {
              console.log(`🎞️ Transcoding progress [${sessionId}]: ${message.trim()}`);
            }
          });

          transcodeProcess.on('close', (code: number) => {
            console.log(`🎬 FFmpeg process closed with code ${code} (session: ${sessionId})`);
            activeTranscodeSessions.delete(`${ratingKey}-${sessionId}`);
            if (!controllerClosed) {
              try {
                controller.close();
                controllerClosed = true;
              } catch (error) {
                console.log('🎬 Controller already closed in close handler');
              }
            }
          });

          transcodeProcess.on('error', (error: any) => {
            console.error(`🎬 FFmpeg error (session: ${sessionId}): ${error}`);
            activeTranscodeSessions.delete(`${ratingKey}-${sessionId}`);
            if (!controllerClosed) {
              try {
                controller.error(error);
                controllerClosed = true;
              } catch (controllerError) {
                console.log('🎬 Controller already closed in error handler');
              }
            }
          });

          // Handle client disconnect
          request.signal.addEventListener('abort', () => {
            console.log(`🎬 Client disconnected, cleaning up session: ${sessionId}`);
            cleanup();
            activeTranscodeSessions.delete(`${ratingKey}-${sessionId}`);
            if (!controllerClosed) {
              try {
                controller.close();
                controllerClosed = true;
              } catch (error) {
                console.log('🎬 Controller already closed in abort handler');
              }
            }
          });
        }
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
          'X-Session-ID': sessionId,
        }
      });

    } catch (ffmpegError) {
      console.error(`🎬 FFmpeg transcoding failed: ${ffmpegError}`);
      return new Response(`FFmpeg transcoding failed: ${ffmpegError}`, { 
        status: 500 
      });
    }

  } catch (error) {
    console.error('🎬 Video proxy error:', error);
    return new Response(`Video proxy error: ${error}`, { 
      status: 500 
    });
  }
}