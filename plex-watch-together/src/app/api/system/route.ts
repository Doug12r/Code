import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import os from 'os'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get system information
    const totalMemory = os.totalmem()
    const freeMemory = os.freemem()
    const usedMemory = totalMemory - freeMemory
    const memoryUsagePercent = Math.round((usedMemory / totalMemory) * 100)

    // Get CPU information
    const cpus = os.cpus()
    const cpuCount = cpus.length
    const cpuModel = cpus[0]?.model || 'Unknown'

    // Get load averages (1, 5, 15 minutes) - Unix-like systems only
    const loadAverage = os.loadavg()

    // Platform and architecture
    const platform = os.platform()
    const arch = os.arch()
    const nodeVersion = process.version
    const uptime = os.uptime()

    // Network interfaces
    const networkInterfaces = os.networkInterfaces()
    const activeInterfaces = Object.keys(networkInterfaces).filter(name => 
      networkInterfaces[name]?.some(iface => !iface.internal)
    )

    const systemInfo = {
      // Memory Information
      memory: {
        total: Math.round(totalMemory / 1024 / 1024 / 1024 * 100) / 100, // GB
        used: Math.round(usedMemory / 1024 / 1024 / 1024 * 100) / 100, // GB
        free: Math.round(freeMemory / 1024 / 1024 / 1024 * 100) / 100, // GB
        usagePercent: memoryUsagePercent
      },

      // CPU Information
      cpu: {
        model: cpuModel,
        cores: cpuCount,
        loadAverage: loadAverage.map(load => Math.round(load * 100) / 100),
        // Note: Real-time CPU usage requires interval sampling
        architecture: arch
      },

      // Node.js Process Information
      process: {
        nodeVersion,
        pid: process.pid,
        uptime: Math.round(process.uptime()),
        memory: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024), // MB
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024), // MB
          external: Math.round(process.memoryUsage().external / 1024 / 1024) // MB
        }
      },

      // System Information
      system: {
        platform,
        hostname: os.hostname(),
        uptime: Math.round(uptime / 3600), // hours
        activeNetworkInterfaces: activeInterfaces
      },

      // Timestamp
      timestamp: Date.now()
    }

    return NextResponse.json({
      success: true,
      systemInfo
    })

  } catch (error) {
    console.error('Error fetching system info:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch system information'
    }, { status: 500 })
  }
}