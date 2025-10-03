import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getRedisClient } from '@/lib/redis';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: roomId } = await params;
    const userId = session.user.id;

    // Single optimized query with proper includes to avoid N+1 queries
    const roomWithAccess = await prisma.watchRoom.findFirst({
      where: { 
        id: roomId,
        // Check membership access in the same query
        members: {
          some: {
            userId,
            isActive: true
          }
        }
      },
      select: {
        id: true,
        name: true,
        description: true,
        isPublic: true,
        isActive: true,
        currentMediaId: true,
        currentMediaTitle: true,
        currentMediaType: true,
        currentPosition: true,
        isPlaying: true,
        lastSyncAt: true,
        maxMembers: true,
        createdAt: true,
        updatedAt: true,
        // Include Plex metadata
        plexRatingKey: true,
        plexMachineId: true,
        plexLibrarySectionId: true,
        creator: {
          select: { 
            id: true, 
            name: true, 
            email: true, 
            image: true 
          }
        },
        members: {
          where: { isActive: true },
          select: {
            id: true,
            canControl: true,
            canInvite: true,
            lastSeen: true,
            currentPosition: true,
            joinedAt: true,
            user: {
              select: { 
                id: true, 
                name: true, 
                email: true, 
                image: true 
              }
            }
          },
          orderBy: [
            { canControl: 'desc' }, // Controllers first
            { lastSeen: 'desc' } // Most recently active first
          ]
        },
        _count: {
          select: {
            members: {
              where: { isActive: true }
            }
          }
        }
      }
    });

    if (!roomWithAccess) {
      return NextResponse.json({ 
        error: 'Room not found or you are not a member of this room' 
      }, { status: 404 });
    }

    // Cache room data in Redis for faster subsequent requests
    try {
      const redis = getRedisClient();
      const cacheKey = `room:${roomId}:full`;
      const cacheData = {
        room: roomWithAccess,
        lastUpdated: Date.now()
      };
      
      // Cache for 2 minutes (room state changes frequently)
      await redis.set(cacheKey, JSON.stringify(cacheData), { ttl: 120 });
      
      console.log(`📄 Cached room data for ${roomId} (${Date.now() - startTime}ms)`);
    } catch (cacheError) {
      console.warn('Redis cache error (non-critical):', cacheError);
    }

    return NextResponse.json({ 
      room: roomWithAccess,
      performance: {
        queryTime: Date.now() - startTime,
        cached: false,
        memberCount: roomWithAccess._count?.members || 0
      }
    });

  } catch (error) {
    console.error('Error fetching room:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch room',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      },
      { status: 500 }
    );
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

    // Check if user is the room creator
    const room = await prisma.watchRoom.findUnique({
      where: { id: roomId }
    })

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    if (room.creatorId !== session.user.id) {
      return NextResponse.json({ error: 'Only room creator can modify settings' }, { status: 403 })
    }

    // Update room
    const updatedRoom = await prisma.watchRoom.update({
      where: { id: roomId },
      data: {
        name: body.name || room.name,
        description: body.description !== undefined ? body.description : room.description,
        allowChat: body.allowChat !== undefined ? body.allowChat : room.allowChat,
        maxMembers: body.maxMembers || room.maxMembers,
        isPublic: body.isPublic !== undefined ? body.isPublic : room.isPublic
      }
    })

    return NextResponse.json({
      message: 'Room updated successfully',
      room: updatedRoom
    })

  } catch (error) {
    console.error('Error updating room:', error)
    return NextResponse.json({ 
      error: 'Failed to update room' 
    }, { status: 500 })
  }
}