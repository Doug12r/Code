import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createRoomSchema = z.object({
  name: z.string().min(1, 'Room name is required').max(50, 'Room name too long'),
  description: z.string().optional(),
  isPublic: z.boolean().default(false),
  maxMembers: z.number().min(2).max(20).default(10),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, isPublic, maxMembers } = createRoomSchema.parse(body)

    // Generate a unique invite code
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase()

    // Create the room
    const room = await prisma.watchRoom.create({
      data: {
        name,
        description,
        isPublic,
        maxMembers,
        inviteCode,
        creatorId: session.user.id,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            image: true,
          }
        },
        _count: {
          select: {
            members: true,
          }
        }
      }
    })

    // Add creator as room member with full permissions
    await prisma.roomMember.create({
      data: {
        userId: session.user.id,
        roomId: room.id,
        canControl: true,
        canInvite: true,
      }
    })

    return NextResponse.json({
      message: 'Room created successfully',
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        inviteCode: room.inviteCode,
        isPublic: room.isPublic,
        maxMembers: room.maxMembers,
        memberCount: 1, // Creator is the first member
        creator: room.creator,
        createdAt: room.createdAt,
      }
    }, { status: 201 })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Room creation error:', error)
    return NextResponse.json(
      { error: 'Failed to create room' },
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

    // Get user's rooms (where they are a member)
    const rooms = await prisma.watchRoom.findMany({
      where: {
        members: {
          some: {
            userId: session.user.id,
          }
        }
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            image: true,
          }
        },
        _count: {
          select: {
            members: true,
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    })

    const formattedRooms = rooms.map((room: any) => ({
      id: room.id,
      name: room.name,
      description: room.description,
      inviteCode: room.inviteCode,
      isPublic: room.isPublic,
      maxMembers: room.maxMembers,
      memberCount: room._count.members,
      creator: room.creator,
      isActive: room.isActive,
      currentMedia: room.currentMediaTitle,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    }))

    return NextResponse.json({ rooms: formattedRooms })

  } catch (error) {
    console.error('Failed to fetch rooms:', error)
    return NextResponse.json(
      { error: 'Failed to fetch rooms' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
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

    // Verify user owns the room
    const room = await prisma.watchRoom.findUnique({
      where: { id: roomId },
      include: {
        creator: true,
        _count: {
          select: {
            members: true,
          }
        }
      }
    })

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    if (room.creatorId !== session.user.id) {
      return NextResponse.json({ error: 'Only room creator can delete the room' }, { status: 403 })
    }

    // Delete related records in correct order (FK constraints)
    await prisma.$transaction([
      // Delete sync events
      prisma.syncEvent.deleteMany({
        where: { roomId }
      }),
      // Delete chat messages
      prisma.chatMessage.deleteMany({
        where: { roomId }
      }),
      // Delete room members
      prisma.roomMember.deleteMany({
        where: { roomId }
      }),
      // Delete the room itself
      prisma.watchRoom.delete({
        where: { id: roomId }
      })
    ])

    return NextResponse.json({
      message: 'Room deleted successfully',
      roomId: roomId,
      memberCount: room._count.members
    })

  } catch (error) {
    console.error('Room deletion error:', error)
    return NextResponse.json(
      { error: 'Failed to delete room' },
      { status: 500 }
    )
  }
}