import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'

// Error types for better error handling
export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  PLEX_CONNECTION_ERROR = 'PLEX_CONNECTION_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface AppError {
  type: ErrorType
  message: string
  statusCode: number
  details?: any
  stack?: string
}

/**
 * Custom error classes for better error handling
 */
export class ValidationError extends Error {
  type = ErrorType.VALIDATION_ERROR
  statusCode = 400
  details: any

  constructor(message: string, details?: any) {
    super(message)
    this.name = 'ValidationError'
    this.details = details
  }
}

export class AuthenticationError extends Error {
  type = ErrorType.AUTHENTICATION_ERROR
  statusCode = 401

  constructor(message: string = 'Authentication required') {
    super(message)
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends Error {
  type = ErrorType.AUTHORIZATION_ERROR
  statusCode = 403

  constructor(message: string = 'Insufficient permissions') {
    super(message)
    this.name = 'AuthorizationError'
  }
}

export class NotFoundError extends Error {
  type = ErrorType.NOT_FOUND_ERROR
  statusCode = 404

  constructor(resource: string = 'Resource') {
    super(`${resource} not found`)
    this.name = 'NotFoundError'
  }
}

export class PlexConnectionError extends Error {
  type = ErrorType.PLEX_CONNECTION_ERROR
  statusCode = 503
  details: any

  constructor(message: string, details?: any) {
    super(message)
    this.name = 'PlexConnectionError'
    this.details = details
  }
}

/**
 * Error logger for monitoring and debugging
 */
class ErrorLogger {
  private static instance: ErrorLogger
  
  static getInstance(): ErrorLogger {
    if (!ErrorLogger.instance) {
      ErrorLogger.instance = new ErrorLogger()
    }
    return ErrorLogger.instance
  }

  log(error: Error | AppError, context?: {
    request?: NextRequest
    userId?: string
    endpoint?: string
    additionalData?: any
  }) {
    const timestamp = new Date().toISOString()
    const errorInfo = {
      timestamp,
      name: error instanceof Error ? error.name : 'AppError',
      message: error.message,
      stack: error instanceof Error ? error.stack : undefined,
      type: 'type' in error ? error.type : ErrorType.INTERNAL_ERROR,
      statusCode: 'statusCode' in error ? error.statusCode : 500,
      context: {
        endpoint: context?.endpoint || context?.request?.nextUrl?.pathname,
        method: context?.request?.method,
        userAgent: context?.request?.headers?.get('user-agent'),
        userId: context?.userId,
        additionalData: context?.additionalData,
      }
    }

    // In production, send to monitoring service (e.g., Sentry, DataDog)
    if (process.env.NODE_ENV === 'production') {
      // TODO: Implement production error tracking
      console.error('🚨 Production Error:', JSON.stringify(errorInfo, null, 2))
    } else {
      console.error('🚨 Development Error:', errorInfo)
    }

    // Store critical errors in database for analysis
    if (this.isCriticalError(error)) {
      this.storeCriticalError(errorInfo).catch(console.error)
    }
  }

  private isCriticalError(error: Error | AppError): boolean {
    const criticalTypes = [
      ErrorType.DATABASE_ERROR,
      ErrorType.INTERNAL_ERROR,
    ]
    
    return 'type' in error && criticalTypes.includes(error.type)
  }

  private async storeCriticalError(errorInfo: any) {
    try {
      // In a real app, store in a separate error tracking table
      console.log('💾 Storing critical error for analysis:', errorInfo.message)
    } catch (dbError) {
      console.error('Failed to store error in database:', dbError)
    }
  }
}

export const errorLogger = ErrorLogger.getInstance()

/**
 * Transform various error types into standardized API responses
 */
export function handleApiError(error: unknown, request?: NextRequest): NextResponse {
  let appError: AppError

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    appError = {
      type: ErrorType.VALIDATION_ERROR,
      message: 'Validation failed',
      statusCode: 400,
      details: error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }))
    }
  }
  // Handle Prisma errors
  else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      appError = {
        type: ErrorType.VALIDATION_ERROR,
        message: 'A record with this information already exists',
        statusCode: 409,
        details: { field: error.meta?.target }
      }
    } else if (error.code === 'P2025') {
      appError = {
        type: ErrorType.NOT_FOUND_ERROR,
        message: 'The requested resource was not found',
        statusCode: 404
      }
    } else {
      appError = {
        type: ErrorType.DATABASE_ERROR,
        message: 'Database operation failed',
        statusCode: 500,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    }
  }
  // Handle custom app errors
  else if (error instanceof ValidationError || 
           error instanceof AuthenticationError || 
           error instanceof AuthorizationError || 
           error instanceof NotFoundError || 
           error instanceof PlexConnectionError) {
    appError = {
      type: error.type,
      message: error.message,
      statusCode: error.statusCode,
      details: 'details' in error ? error.details : undefined
    }
  }
  // Handle network/fetch errors
  else if (error instanceof TypeError && error.message.includes('fetch')) {
    appError = {
      type: ErrorType.NETWORK_ERROR,
      message: 'Network request failed',
      statusCode: 503,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }
  }
  // Handle generic errors
  else if (error instanceof Error) {
    appError = {
      type: ErrorType.INTERNAL_ERROR,
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
      statusCode: 500,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }
  }
  // Handle unknown errors
  else {
    appError = {
      type: ErrorType.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
      statusCode: 500,
      details: process.env.NODE_ENV === 'development' ? String(error) : undefined
    }
  }

  // Log the error
  errorLogger.log(appError, { request })

  // Return formatted error response
  return NextResponse.json({
    success: false,
    error: {
      type: appError.type,
      message: appError.message,
      ...(appError.details && { details: appError.details }),
      ...(appError.stack && process.env.NODE_ENV === 'development' && { stack: appError.stack }),
    },
    timestamp: new Date().toISOString(),
  }, { 
    status: appError.statusCode,
    headers: {
      'Content-Type': 'application/json',
    }
  })
}

/**
 * Higher-order function to wrap API routes with error handling
 */
export function withErrorHandling(
  handler: (request: NextRequest, ...args: any[]) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: any[]) => {
    try {
      return await handler(request, ...args)
    } catch (error) {
      return handleApiError(error, request)
    }
  }
}

/**
 * Async wrapper for better error handling in try-catch blocks
 */
export async function safeAsync<T>(
  operation: () => Promise<T>,
  fallback?: T
): Promise<[T | null, Error | null]> {
  try {
    const result = await operation()
    return [result, null]
  } catch (error) {
    return [fallback || null, error instanceof Error ? error : new Error(String(error))]
  }
}