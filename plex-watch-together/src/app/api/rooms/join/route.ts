import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const joinRoomSchema = z.object({
  inviteCode: z.string().min(1, 'Invite code is required'),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { inviteCode } = joinRoomSchema.parse(body)

    // Find the room by invite code
    const room = await prisma.watchRoom.findUnique({
      where: { 
        inviteCode: inviteCode.toUpperCase(),
        isActive: true 
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

    if (!room) {
      return NextResponse.json(
        { error: 'Room not found or inactive' },
        { status: 404 }
      )
    }

    // Check if room is full
    if (room._count.members >= room.maxMembers) {
      return NextResponse.json(
        { error: 'Room is full' },
        { status: 400 }
      )
    }

    // Check if user is already a member
    const existingMember = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: session.user.id,
          roomId: room.id,
        }
      }
    })

    if (existingMember) {
      if (existingMember.isActive) {
        return NextResponse.json(
          { error: 'You are already a member of this room' },
          { status: 400 }
        )
      } else {
        // Reactivate membership
        await prisma.roomMember.update({
          where: {
            userId_roomId: {
              userId: session.user.id,
              roomId: room.id,
            }
          },
          data: {
            isActive: true,
            lastSeen: new Date(),
          }
        })
      }
    } else {
      // Add user as new member
      await prisma.roomMember.create({
        data: {
          userId: session.user.id,
          roomId: room.id,
          canControl: false, // Default permissions
          canInvite: false,
        }
      })
    }

    return NextResponse.json({
      message: 'Successfully joined room',
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        creator: room.creator,
        memberCount: room._count.members + 1,
      }
    })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Join room error:', error)
    return NextResponse.json(
      { error: 'Failed to join room' },
      { status: 500 }
    )
  }
}