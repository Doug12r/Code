import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: roomId } = await params
    const body = await request.json()
    const { mediaId, mediaTitle, mediaType } = body

    if (!mediaId || !mediaTitle) {
      return NextResponse.json({ error: 'Media ID and title are required' }, { status: 400 })
    }

    // Check if user has control permissions
    const roomMember = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: session.user.id,
          roomId
        }
      },
      include: {
        room: true
      }
    })

    if (!roomMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    if (!roomMember.canControl && roomMember.room.creatorId !== session.user.id) {
      return NextResponse.json({ 
        error: 'Only users with control permissions can change media' 
      }, { status: 403 })
    }

    // Update room with new media
    const updatedRoom = await prisma.watchRoom.update({
      where: { id: roomId },
      data: {
        currentMediaId: mediaId,
        currentMediaTitle: mediaTitle,
        currentMediaType: mediaType || 'unknown',
        currentPosition: 0, // Reset position
        isPlaying: false, // Start paused
        lastSyncAt: new Date()
      }
    })

    // Log the media change event
    await prisma.syncEvent.create({
      data: {
        roomId,
        eventType: 'media_change',
        position: 0,
        userId: session.user.id
      }
    })

    // Create system chat message
    await prisma.chatMessage.create({
      data: {
        content: `${session.user.name} changed the media to: ${mediaTitle}`,
        type: 'system',
        userId: session.user.id,
        roomId
      }
    })

    return NextResponse.json({
      message: 'Media updated successfully',
      room: {
        id: updatedRoom.id,
        currentMedia: {
          id: updatedRoom.currentMediaId,
          title: updatedRoom.currentMediaTitle,
          type: updatedRoom.currentMediaType
        },
        currentPosition: updatedRoom.currentPosition,
        isPlaying: updatedRoom.isPlaying
      }
    })

  } catch (error) {
    console.error('Error updating room media:', error)
    return NextResponse.json({ 
      error: 'Failed to update media' 
    }, { status: 500 })
  }
}