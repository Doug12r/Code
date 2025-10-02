import { NextResponse } from 'next/server'
import { PlexServiceTester } from '@/lib/plex-service.test'

export async function GET() {
  try {
    console.log('🧪 Starting Plex Service Plugin Tests...')
    
    // Capture console output
    const originalLog = console.log
    const logs: string[] = []
    
    console.log = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ')
      logs.push(message)
      originalLog(...args)
    }
    
    try {
      const tester = new PlexServiceTester()
      await tester.runAllTests()
      
      // Restore console.log
      console.log = originalLog
      
      return NextResponse.json({
        success: true,
        message: 'Tests completed successfully',
        logs: logs,
        timestamp: new Date().toISOString()
      })
      
    } catch (error) {
      console.log = originalLog
      
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        logs: logs,
        timestamp: new Date().toISOString()
      }, { status: 500 })
    }
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}