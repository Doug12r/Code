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
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0)

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

    // Get recent chat messages
    const messages = await prisma.chatMessage.findMany({
      where: {
        roomId
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
        createdAt: 'desc'
      },
      take: limit,
      skip: offset
    })

    // Reverse to get chronological order (oldest first)
    const chronologicalMessages = messages.reverse()

    return NextResponse.json({
      messages: chronologicalMessages.map(message => ({
        id: message.id,
        content: message.content,
        user: message.user,
        createdAt: message.createdAt,
        type: message.type
      })),
      pagination: {
        limit,
        offset,
        hasMore: messages.length === limit
      }
    })

  } catch (error) {
    console.error('Error fetching chat messages:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch chat messages' 
    }, { status: 500 })
  }
}

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
    const { content } = body

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Message content required' }, { status: 400 })
    }

    if (content.length > 1000) {
      return NextResponse.json({ error: 'Message too long' }, { status: 400 })
    }

    // Check if user has access to this room and chat is allowed
    const room = await prisma.watchRoom.findUnique({
      where: { id: roomId },
      include: {
        members: {
          where: {
            userId: session.user.id,
            isActive: true
          }
        }
      }
    })

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    if (!room.allowChat) {
      return NextResponse.json({ error: 'Chat is disabled in this room' }, { status: 403 })
    }

    if (room.members.length === 0) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Create chat message
    const message = await prisma.chatMessage.create({
      data: {
        content: content.trim(),
        type: 'text',
        userId: session.user.id,
        roomId
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
      message: 'Message sent successfully',
      chatMessage: {
        id: message.id,
        content: message.content,
        user: message.user,
        createdAt: message.createdAt,
        type: message.type
      }
    }, { status: 201 })

  } catch (error) {
    console.error('Error sending chat message:', error)
    return NextResponse.json({ 
      error: 'Failed to send message' 
    }, { status: 500 })
  }
}