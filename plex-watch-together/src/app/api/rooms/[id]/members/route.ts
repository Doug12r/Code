import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: roomId } = await params

    // Check if user has access to this room
    const roomMember = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: session.user.id,
          roomId
        }
      }
    })

    if (!roomMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get all active room members
    const members = await prisma.roomMember.findMany({
      where: {
        roomId,
        isActive: true
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true
          }
        }
      },
      orderBy: {
        joinedAt: 'asc'
      }
    })

    return NextResponse.json({
      members: members.map(member => ({
        id: member.id,
        user: member.user,
        canControl: member.canControl,
        canInvite: member.canInvite,
        isActive: member.isActive,
        joinedAt: member.joinedAt,
        lastSeen: member.lastSeen
      }))
    })

  } catch (error) {
    console.error('Error fetching room members:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch room members' 
    }, { status: 500 })
  }
}

export async function PATCH(
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
    const { memberId, canControl, canInvite } = body

    // Check if user is room creator or has admin permissions
    const room = await prisma.watchRoom.findUnique({
      where: { id: roomId },
      include: {
        members: {
          where: {
            userId: session.user.id
          }
        }
      }
    })

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    const currentMember = room.members[0]
    const isCreator = room.creatorId === session.user.id
    const hasAdminPermissions = isCreator || currentMember?.canInvite

    if (!hasAdminPermissions) {
      return NextResponse.json({ 
        error: 'Insufficient permissions to modify member permissions' 
      }, { status: 403 })
    }

    // Update member permissions
    const updatedMember = await prisma.roomMember.update({
      where: {
        id: memberId
      },
      data: {
        canControl: canControl !== undefined ? canControl : undefined,
        canInvite: canInvite !== undefined ? canInvite : undefined
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true
          }
        }
      }
    })

    return NextResponse.json({
      message: 'Member permissions updated',
      member: {
        id: updatedMember.id,
        user: updatedMember.user,
        canControl: updatedMember.canControl,
        canInvite: updatedMember.canInvite,
        isActive: updatedMember.isActive,
        joinedAt: updatedMember.joinedAt,
        lastSeen: updatedMember.lastSeen
      }
    })

  } catch (error) {
    console.error('Error updating member permissions:', error)
    return NextResponse.json({ 
      error: 'Failed to update member permissions' 
    }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: roomId } = await params
    const { searchParams } = new URL(request.url)
    const memberIdToRemove = searchParams.get('memberId')

    if (!memberIdToRemove) {
      return NextResponse.json({ error: 'Member ID required' }, { status: 400 })
    }

    // Check permissions
    const room = await prisma.watchRoom.findUnique({
      where: { id: roomId }
    })

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    const isCreator = room.creatorId === session.user.id
    const isSelf = memberIdToRemove === session.user.id

    if (!isCreator && !isSelf) {
      return NextResponse.json({ 
        error: 'Can only remove yourself or be room creator' 
      }, { status: 403 })
    }

    // Remove member (set as inactive)
    await prisma.roomMember.updateMany({
      where: {
        userId: memberIdToRemove,
        roomId
      },
      data: {
        isActive: false,
        lastSeen: new Date()
      }
    })

    return NextResponse.json({
      message: 'Member removed from room',
      memberId: memberIdToRemove
    })

  } catch (error) {
    console.error('Error removing member:', error)
    return NextResponse.json({ 
      error: 'Failed to remove member' 
    }, { status: 500 })
  }
}