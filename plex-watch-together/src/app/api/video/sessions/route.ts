import { NextResponse } from 'next/server';
import { VideoTranscoder } from '@/lib/transcoding';

export async function GET() {
  try {
    const activeSessions = VideoTranscoder.getActiveTranscodes();
    
    return NextResponse.json({
      success: true,
      activeSessions,
      count: activeSessions.length,
      totalDuration: activeSessions.reduce((sum, session) => sum + session.duration, 0)
    });
  } catch (error) {
    console.error('Error getting active transcoding sessions:', error);
    return NextResponse.json(
      { error: 'Failed to get transcoding sessions' },
      { status: 500 }
    );
  }
}