import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const syncEventSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  eventType: z.enum(['play', 'pause', 'seek', 'buffer', 'media_change']),
  position: z.number().min(0),
  mediaId: z.string().optional(),
  mediaTitle: z.string().optional(),
  mediaType: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { roomId, eventType, position, mediaId, mediaTitle, mediaType } = syncEventSchema.parse(body)

    // Verify user is a member of the room
    const roomMember = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: session.user.id,
          roomId: roomId,
        }
      },
      include: {
        room: true,
      }
    })

    if (!roomMember) {
      return NextResponse.json({ error: 'You are not a member of this room' }, { status: 403 })
    }

    // Check if user has control permissions for control events
    if (['play', 'pause', 'seek', 'media_change'].includes(eventType) && !roomMember.canControl) {
      return NextResponse.json({ error: 'You do not have control permissions' }, { status: 403 })
    }

    // Update room state and create sync event
    const updates: any = {
      lastSyncAt: new Date(),
    }

    if (eventType === 'play') {
      updates.isPlaying = true
      updates.currentPosition = position
    } else if (eventType === 'pause') {
      updates.isPlaying = false
      updates.currentPosition = position
    } else if (eventType === 'seek') {
      updates.currentPosition = position
    } else if (eventType === 'media_change' && mediaId && mediaTitle) {
      updates.currentMediaId = mediaId
      updates.currentMediaTitle = mediaTitle
      updates.currentMediaType = mediaType || 'unknown'
      updates.currentPosition = 0
      updates.isPlaying = false
    }

    // Update room and create sync event
    const [updatedRoom, syncEvent] = await prisma.$transaction([
      prisma.watchRoom.update({
        where: { id: roomId },
        data: updates,
        include: {
          creator: {
            select: { id: true, name: true, image: true }
          },
          _count: {
            select: { members: true }
          }
        }
      }),
      prisma.syncEvent.create({
        data: {
          eventType,
          position,
          userId: session.user.id,
          roomId: roomId,
        }
      })
    ])

    // Update user's position
    await prisma.roomMember.update({
      where: {
        userId_roomId: {
          userId: session.user.id,
          roomId: roomId,
        }
      },
      data: {
        currentPosition: position,
        lastSeen: new Date(),
      }
    })

    return NextResponse.json({
      message: 'Sync event processed successfully',
      syncEvent: {
        id: syncEvent.id,
        eventType: syncEvent.eventType,
        position: syncEvent.position,
        timestamp: syncEvent.timestamp,
      },
      roomState: {
        currentPosition: updatedRoom.currentPosition,
        isPlaying: updatedRoom.isPlaying,
        currentMediaId: updatedRoom.currentMediaId,
        currentMediaTitle: updatedRoom.currentMediaTitle,
        currentMediaType: updatedRoom.currentMediaType,
        lastSyncAt: updatedRoom.lastSyncAt,
        memberCount: updatedRoom._count.members,
      }
    })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Sync event error:', error)
    return NextResponse.json(
      { error: 'Failed to process sync event' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const roomId = searchParams.get('roomId')
    
    if (!roomId) {
      return NextResponse.json({ error: 'Room ID is required' }, { status: 400 })
    }

    // Verify user is a member of the room
    const roomMember = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: session.user.id,
          roomId: roomId,
        }
      }
    })

    if (!roomMember) {
      return NextResponse.json({ error: 'You are not a member of this room' }, { status: 403 })
    }

    // Get current room state and recent sync events
    const [room, recentEvents] = await Promise.all([
      prisma.watchRoom.findUnique({
        where: { id: roomId },
        include: {
          creator: {
            select: { id: true, name: true, image: true }
          },
          members: {
            include: {
              user: {
                select: { id: true, name: true, image: true }
              }
            }
          }
        }
      }),
      prisma.syncEvent.findMany({
        where: { roomId },
        orderBy: { timestamp: 'desc' },
        take: 10,
      })
    ])

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    return NextResponse.json({
      roomState: {
        id: room.id,
        name: room.name,
        currentPosition: room.currentPosition,
        isPlaying: room.isPlaying,
        currentMediaId: room.currentMediaId,
        currentMediaTitle: room.currentMediaTitle,
        currentMediaType: room.currentMediaType,
        lastSyncAt: room.lastSyncAt,
        creator: room.creator,
        members: room.members.map(member => ({
          id: member.id,
          user: member.user,
          canControl: member.canControl,
          canInvite: member.canInvite,
          lastSeen: member.lastSeen,
          currentPosition: member.currentPosition,
        })),
      },
      recentEvents: recentEvents.map(event => ({
        id: event.id,
        eventType: event.eventType,
        position: event.position,
        timestamp: event.timestamp,
        userId: event.userId,
      })),
    })

  } catch (error) {
    console.error('Get room state error:', error)
    return NextResponse.json(
      { error: 'Failed to get room state' },
      { status: 500 }
    )
  }
}