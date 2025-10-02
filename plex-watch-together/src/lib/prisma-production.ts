import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'

// Enhanced Prisma client for production with connection pooling and monitoring
class EnhancedPrismaClient extends PrismaClient {
  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
    })
  }

  private async logQueryPerformance(params: any, duration: number) {
    try {
      // Log to monitoring service or file in production
      console.log(`📊 Query: ${params.model}.${params.action} took ${duration}ms`)
    } catch (error) {
      // Silently fail to avoid affecting main queries
      console.error('Failed to log query performance:', error)
    }
  }

  // Health check method
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy', latency: number }> {
    try {
      const start = Date.now()
      await this.$queryRaw`SELECT 1 as health_check`
      const latency = Date.now() - start
      
      return { status: 'healthy', latency }
    } catch (error) {
      console.error('Database health check failed:', error)
      return { status: 'unhealthy', latency: -1 }
    }
  }

  // Connection pool status
  getConnectionInfo() {
    return {
      // @ts-ignore - accessing internal connection info
      connectionCount: this._engine?.connectionPromise ? 1 : 0,
      // Add more connection pool metrics if needed
    }
  }
}

// Database connection pooling for production
let prisma: EnhancedPrismaClient

declare global {
  var __prisma: EnhancedPrismaClient | undefined
}

if (process.env.NODE_ENV === 'production') {
  prisma = new EnhancedPrismaClient()
} else {
  // In development, reuse the connection to avoid exhausting database connections
  if (!global.__prisma) {
    global.__prisma = new EnhancedPrismaClient()
  }
  prisma = global.__prisma
}

// PostgreSQL connection pool for direct queries (if needed)
let pgPool: Pool | null = null

export function getPostgreSQLPool(): Pool {
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: parseInt(process.env.DATABASE_POOL_MAX || '20'),
      min: parseInt(process.env.DATABASE_POOL_MIN || '5'),
      connectionTimeoutMillis: parseInt(process.env.DATABASE_POOL_TIMEOUT || '30000'),
      idleTimeoutMillis: parseInt(process.env.DATABASE_POOL_IDLE_TIMEOUT || '30000'),
    })

    pgPool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err)
    })

    pgPool.on('connect', () => {
      console.log('🐘 New PostgreSQL connection established')
    })

    pgPool.on('remove', () => {
      console.log('🐘 PostgreSQL connection removed from pool')
    })
  }

  return pgPool
}

// Database migration utilities
export async function runMigrations() {
  try {
    console.log('🔄 Running database migrations...')
    
    // Use Prisma's migration system
    const { execSync } = require('child_process')
    execSync('npx prisma migrate deploy', { stdio: 'inherit' })
    
    console.log('✅ Database migrations completed')
  } catch (error) {
    console.error('❌ Database migration failed:', error)
    throw error
  }
}

// Database seeding for initial data
export async function seedDatabase() {
  try {
    console.log('🌱 Seeding database...')
    
    // Create default admin user if none exists
    const adminUser = await prisma.user.findFirst({
      where: { email: process.env.ADMIN_EMAIL }
    })

    if (!adminUser && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      const bcrypt = await import('bcryptjs')
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12)
      
      await prisma.user.create({
        data: {
          email: process.env.ADMIN_EMAIL,
          name: 'Administrator',
          password: hashedPassword,
        }
      })
      
      console.log('👤 Admin user created')
    }
    
    console.log('✅ Database seeding completed')
  } catch (error) {
    console.error('❌ Database seeding failed:', error)
    throw error
  }
}

// Cleanup function for graceful shutdown
export async function cleanup() {
  if (pgPool) {
    await pgPool.end()
    console.log('🐘 PostgreSQL pool closed')
  }
  
  await prisma.$disconnect()
  console.log('🔌 Prisma client disconnected')
}

// Handle graceful shutdown
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
process.on('beforeExit', cleanup)

export { prisma }
export default prisma