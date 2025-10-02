import { NextRequest, NextResponse } from 'next/server';
import { VideoTranscoder } from '@/lib/transcoding';

export async function POST(request: NextRequest) {
  try {
    const { sessionId, ratingKey } = await request.json();
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    console.log(`🛑 Manual stop request for session: ${sessionId}`);
    
    // Stop the specific transcoding session
    const key = ratingKey ? `${ratingKey}-${sessionId}` : sessionId;
    VideoTranscoder.stopTranscode(key);
    
    return NextResponse.json({
      success: true,
      message: `Transcoding session ${sessionId} stopped`,
    });
  } catch (error) {
    console.error('Error stopping transcoding session:', error);
    return NextResponse.json(
      { error: 'Failed to stop transcoding session' },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Return information about active transcoding sessions
  try {
    // This would require exposing session info from VideoTranscoder
    return NextResponse.json({
      message: 'Use POST method to stop a transcoding session',
      usage: {
        method: 'POST',
        body: {
          sessionId: 'string (required)',
          ratingKey: 'string (optional)'
        }
      }
    });
  } catch (error) {
    console.error('Error getting transcoding sessions:', error);
    return NextResponse.json(
      { error: 'Failed to get transcoding sessions' },
      { status: 500 }
    );
  }
}