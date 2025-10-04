import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface ErrorReport {
  message: string
  stack?: string
  errorId: string
  context?: string
  componentStack?: string
  userAgent: string
  timestamp: string
  retryCount: number
  url?: string
  userId?: string
}

export async function POST(request: NextRequest) {
  try {
    const errorReport: ErrorReport = await request.json()

    // Validate required fields
    if (!errorReport.message || !errorReport.errorId) {
      return NextResponse.json(
        { error: 'Missing required fields: message and errorId' },
        { status: 400 }
      )
    }

    // Log error to console for development
    console.error('Client Error Report:', {
      id: errorReport.errorId,
      message: errorReport.message,
      context: errorReport.context,
      timestamp: errorReport.timestamp
    })

    // In production, you would:
    // 1. Store in database for analysis
    // 2. Send to error monitoring service (Sentry, LogRocket, etc.)
    // 3. Alert on critical errors
    
    // Example: Store in database (optional)
    try {
      // Uncomment if you have an errors table
      /*
      await prisma.errorReport.create({
        data: {
          errorId: errorReport.errorId,
          message: errorReport.message,
          stack: errorReport.stack,
          context: errorReport.context,
          componentStack: errorReport.componentStack,
          userAgent: errorReport.userAgent,
          retryCount: errorReport.retryCount,
          url: errorReport.url,
          userId: errorReport.userId,
          createdAt: new Date(errorReport.timestamp)
        }
      })
      */
    } catch (dbError) {
      console.error('Failed to store error report in database:', dbError)
      // Don't fail the request if DB storage fails
    }

    // Send to external monitoring service (example)
    try {
      if (process.env.SENTRY_DSN) {
        // Example Sentry integration
        // You would implement actual Sentry client here
        console.log('Would send to Sentry:', errorReport.errorId)
      }

      if (process.env.SLACK_WEBHOOK_URL && isHighPriorityError(errorReport)) {
        // Send critical errors to Slack
        await sendSlackAlert(errorReport)
      }
    } catch (monitoringError) {
      console.error('Failed to send to monitoring service:', monitoringError)
      // Don't fail the request if monitoring fails
    }

    return NextResponse.json({ 
      success: true, 
      errorId: errorReport.errorId,
      message: 'Error report received'
    })

  } catch (error) {
    console.error('Error processing error report:', error)
    return NextResponse.json(
      { error: 'Failed to process error report' },
      { status: 500 }
    )
  }
}

function isHighPriorityError(report: ErrorReport): boolean {
  const criticalKeywords = [
    'critical',
    'security',
    'data loss',
    'corruption',
    'crash'
  ]
  
  const message = report.message.toLowerCase()
  return criticalKeywords.some(keyword => message.includes(keyword)) ||
         report.retryCount >= 3
}

async function sendSlackAlert(report: ErrorReport) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return

  const payload = {
    text: `🚨 Critical Error Detected`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🚨 Critical Application Error'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Error ID:*\n${report.errorId}`
          },
          {
            type: 'mrkdwn',
            text: `*Context:*\n${report.context || 'Unknown'}`
          },
          {
            type: 'mrkdwn',
            text: `*Retry Count:*\n${report.retryCount}`
          },
          {
            type: 'mrkdwn',
            text: `*Timestamp:*\n${report.timestamp}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Error Message:*\n\`\`\`${report.message}\`\`\``
        }
      }
    ]
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    console.error('Failed to send Slack alert:', error)
  }
}

// Get error statistics (for admin dashboard)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const hours = parseInt(searchParams.get('hours') || '24')
    const limit = parseInt(searchParams.get('limit') || '10')

    // Query error statistics from database
    // Note: Uncomment when errorReport table is created
    const stats = {
      totalErrors: 0, // TODO: Implement with actual database query when error table is ready
      recentErrors: [], // TODO: Query recent errors from database
      errorsByContext: {}, // TODO: Group errors by context
      errorsByType: {}, // TODO: Group errors by type
      timestamp: new Date().toISOString(),
      note: 'Error statistics require errorReport database table to be created'
    }

    return NextResponse.json(stats)

  } catch (error) {
    console.error('Error fetching error statistics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch error statistics' },
      { status: 500 }
    )
  }
}