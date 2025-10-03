import { PrismaClient } from '@prisma/client'
import { getCachingService } from './caching-service'

// Enhanced Prisma client with production optimizations
const createPrismaClient = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'error', 'warn'] 
      : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  })
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Enhanced query wrapper for performance monitoring
export async function executePrismaQuery<T>(
  name: string,
  queryFn: () => Promise<T>
): Promise<T> {
  const start = Date.now()
  
  try {
    const result = await queryFn()
    const duration = Date.now() - start
    
    // Log slow queries
    if (duration > 1000) {
      console.warn(`🐌 Slow query detected: ${name} (${duration}ms)`)
    }
    
    // Track query metrics in production
    if (process.env.NODE_ENV === 'production') {
      try {
        const cache = getCachingService()
        await cache.setMetrics(`query:${name}`, {
          duration,
          timestamp: Date.now(),
          name
        })
      } catch (error) {
        // Don't fail the request if metrics fail
      }
    }
    
    return result
  } catch (error) {
    const duration = Date.now() - start
    console.error(`❌ Query error: ${name} (${duration}ms):`, error)
    throw error
  }
}

// Enhanced database operations with optimizations
export class DatabaseService {
  private cache = getCachingService()

  // Optimized user operations
  async getUserById(id: string) {
    const cacheKey = `id:${id}`
    return await this.cache.getOrSet('USER_PROFILE', cacheKey, async () => {
      return await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          createdAt: true,
          // Don't select password for security
        }
      })
    })
  }

  async getUserByEmail(email: string) {
    const cacheKey = `email:${email}`
    return await this.cache.getOrSet('USER_PROFILE', cacheKey, async () => {
      return await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          password: true, // Only when needed for auth
          createdAt: true,
        }
      })
    })
  }

  // Optimized room operations
  async getRoomById(id: string) {
    const cacheKey = `id:${id}`
    return await this.cache.getOrSet('ROOM_STATE', cacheKey, async () => {
      return await prisma.watchRoom.findUnique({
        where: { id },
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true
                }
              }
            }
          },
          _count: {
            select: {
              members: true,
              syncEvents: true
            }
          }
        }
      })
    })
  }

  async getUserRooms(userId: string) {
    const cacheKey = `user:${userId}:rooms`
    return await this.cache.getOrSet('ROOM_STATE', cacheKey, async () => {
      return await prisma.watchRoom.findMany({
        where: {
          OR: [
            { creatorId: userId },
            { members: { some: { userId } } }
          ]
        },
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              image: true
            }
          },
          _count: {
            select: {
              members: true
            }
          }
        },
        orderBy: {
          updatedAt: 'desc'
        },
        take: 50 // Limit results
      })
    }, 300) // Shorter TTL for user-specific data
  }

  // Batch operations for performance
  async getUsersById(ids: string[]) {
    const cacheKeys = ids.map(id => `id:${id}`)
    const cached = await this.cache.mget('USER_PROFILE', cacheKeys)
    
    const missingIds: string[] = []
    const result: any[] = []
    
    cached.forEach((user, index) => {
      if (user) {
        result[index] = user
      } else {
        missingIds.push(ids[index])
      }
    })
    
    if (missingIds.length > 0) {
      const freshUsers = await prisma.user.findMany({
        where: {
          id: { in: missingIds }
        },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          createdAt: true,
        }
      })
      
      // Cache the fresh results
      const cacheData: Record<string, any> = {}
      freshUsers.forEach(user => {
        cacheData[`id:${user.id}`] = user
        const index = ids.indexOf(user.id)
        if (index !== -1) {
          result[index] = user
        }
      })
      
      if (Object.keys(cacheData).length > 0) {
        await this.cache.mset('USER_PROFILE', cacheData)
      }
    }
    
    return result.filter(Boolean) // Remove null entries
  }

  // Cache invalidation methods
  async invalidateUserCache(userId: string) {
    await Promise.all([
      this.cache.delete('USER_PROFILE', `id:${userId}`),
      this.cache.delete('USER_PROFILE', `email:*`), // Would need pattern matching
      this.cache.delete('ROOM_STATE', `user:${userId}:rooms`)
    ])
  }

  async invalidateRoomCache(roomId: string) {
    await this.cache.delete('ROOM_STATE', `id:${roomId}`)
  }

  // Transaction helpers with caching
  async createRoomWithCache(data: any) {
    const room = await prisma.watchRoom.create({
      data,
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        _count: {
          select: {
            members: true
          }
        }
      }
    })

    // Cache the new room
    await this.cache.set('ROOM_STATE', `id:${room.id}`, room)
    
    // Invalidate user's room list
    await this.cache.delete('ROOM_STATE', `user:${data.creatorId}:rooms`)
    
    return room
  }

  // Health check for database
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy'
    latency: number
    error?: string
  }> {
    try {
      const start = Date.now()
      await prisma.$queryRaw`SELECT 1`
      const latency = Date.now() - start
      
      return {
        status: latency < 1000 ? 'healthy' : 'unhealthy',
        latency
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: -1,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // Query optimization helpers
  async getConnectionStats() {
    try {
      const stats = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*) as count FROM pg_stat_activity WHERE state = 'active'
      `
      
      return {
        activeConnections: stats[0]?.count || 0
      }
    } catch (error) {
      console.error('Failed to get connection stats:', error)
      return {
        activeConnections: -1
      }
    }
  }
}

// Singleton database service
let databaseService: DatabaseService | null = null

export function getDatabaseService(): DatabaseService {
  if (!databaseService) {
    databaseService = new DatabaseService()
  }
  return databaseService
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect()
})