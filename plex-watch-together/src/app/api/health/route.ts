import { NextResponse } from 'next/server'
import { getDatabaseService } from '@/lib/prisma'

export async function GET() {
  try {
    // Use the shared database service for health checks
    const dbService = getDatabaseService()
    const healthCheck = await dbService.healthCheck()
    
    return NextResponse.json({ 
      status: healthCheck.status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0',
      database: healthCheck.status,
      latency: healthCheck.latency
    })
  } catch (error) {
    console.error('Health check failed:', error)
    return NextResponse.json(
      { 
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Health check failed'
      },
      { status: 503 }
    )
  }
}