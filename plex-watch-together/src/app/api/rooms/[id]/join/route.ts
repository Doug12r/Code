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

    // Find the room
    const room = await prisma.watchRoom.findUnique({
      where: { 
        id: roomId,
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
            members: {
              where: { isActive: true }
            }
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
          { message: 'Already a member of this room', room },
          { status: 200 }
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

    console.log(`👥 User ${session.user.name} joined room ${room.name} (${roomId})`)

    return NextResponse.json({
      message: 'Successfully joined room',
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        creator: room.creator,
        memberCount: room._count.members + (existingMember?.isActive ? 0 : 1),
      }
    })

  } catch (error) {
    console.error('Join room error:', error)
    return NextResponse.json(
      { error: 'Failed to join room' },
      { status: 500 }
    )
  }
}