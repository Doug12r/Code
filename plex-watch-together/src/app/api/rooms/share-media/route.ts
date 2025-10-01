import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { roomId, media } = await request.json();

    if (!roomId || !media) {
      return NextResponse.json({ error: 'Room ID and media are required' }, { status: 400 });
    }

    // Verify user is a member of the room
    const membership = await prisma.roomMember.findFirst({
      where: {
        roomId: roomId,
        user: { email: session.user.email }
      }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this room' }, { status: 403 });
    }

    // Update room with currently playing media
    await prisma.room.update({
      where: { id: roomId },
      data: {
        currentMedia: JSON.stringify(media),
        updatedAt: new Date()
      }
    });

    // Create a message about the media sharing
    await prisma.message.create({
      data: {
        content: `🎬 Started playing: ${media.title}`,
        roomId: roomId,
        userId: membership.userId,
        type: 'MEDIA_SHARE'
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sharing media to room:', error);
    return NextResponse.json(
      { error: 'Failed to share media' },
      { status: 500 }
    );
  }
}