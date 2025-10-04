'use client'

import React, { Component, ReactNode, ErrorInfo } from 'react'
import { AppLogger } from '@/lib/structured-logging'

// Error boundary state
interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  errorId: string | null
}

// Error boundary props
interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  level?: 'page' | 'component' | 'critical'
  resetKeys?: Array<string | number>
  resetOnPropsChange?: boolean
}

// Global error handler for unhandled errors
export class GlobalErrorHandler {
  private static initialized = false

  static initialize(): void {
    if (this.initialized || typeof window === 'undefined') return

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      AppLogger.error('Unhandled promise rejection', event.reason, {
        type: 'unhandled_rejection',
        promise: event.promise,
        reason: event.reason
      })

      // Prevent default browser console error
      event.preventDefault()
    })

    // Handle uncaught errors
    window.addEventListener('error', (event) => {
      AppLogger.error('Uncaught error', new Error(event.message), {
        type: 'uncaught_error',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
      })
    })

    // Handle resource loading errors
    window.addEventListener('error', (event) => {
      const target = event.target
      if (target && target instanceof HTMLElement) {
        AppLogger.error('Resource loading error', undefined, {
          type: 'resource_error',
          tagName: target.tagName,
          src: (target as any).src || (target as any).href,
          outerHTML: target.outerHTML?.slice(0, 200)
        })
      }
    }, true)

    this.initialized = true
  }

  static captureException(error: Error, context?: Record<string, any>): string {
    const errorId = crypto.randomUUID()
    
    AppLogger.error('Exception captured', error, {
      errorId,
      context,
      userAgent: navigator?.userAgent,
      url: window?.location?.href,
      timestamp: new Date().toISOString()
    })

    return errorId
  }

  static captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, any>): string {
    const messageId = crypto.randomUUID()
    
    const logMethod = {
      info: AppLogger.info,
      warning: AppLogger.warn,
      error: AppLogger.error
    }[level]

    logMethod(message, undefined, {
      messageId,
      context,
      type: 'captured_message',
      userAgent: navigator?.userAgent,
      url: window?.location?.href
    })

    return messageId
  }
}

// React Error Boundary Component
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private resetTimeoutId: number | null = null

  constructor(props: ErrorBoundaryProps) {
    super(props)

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const errorId = crypto.randomUUID()
    
    return {
      hasError: true,
      error,
      errorId
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { level = 'component', onError } = this.props

    // Generate unique error ID for tracking
    const errorId = this.state.errorId || crypto.randomUUID()

    // Log error with context
    AppLogger.error(`Error boundary caught error (${level})`, error, {
      errorId,
      level,
      componentStack: errorInfo.componentStack,
      errorBoundary: this.constructor.name,
      props: this.props.resetKeys,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      url: typeof window !== 'undefined' ? window.location.href : undefined
    })

    // Update state with error info
    this.setState({
      errorInfo,
      errorId
    })

    // Call custom error handler
    if (onError) {
      onError(error, errorInfo)
    }

    // Auto-reset for non-critical errors
    if (level === 'component') {
      this.resetTimeoutId = window.setTimeout(() => {
        this.resetErrorBoundary()
      }, 5000)
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    const { resetOnPropsChange = true, resetKeys = [] } = this.props
    const { hasError } = this.state

    if (hasError && prevProps.resetKeys !== resetKeys) {
      if (resetOnPropsChange) {
        this.resetErrorBoundary()
      }
    }
  }

  componentWillUnmount(): void {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId)
    }
  }

  resetErrorBoundary = (): void => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId)
      this.resetTimeoutId = null
    }

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null
    })
  }

  render(): ReactNode {
    const { hasError, error, errorId } = this.state
    const { children, fallback, level = 'component' } = this.props

    if (hasError) {
      // Custom fallback UI
      if (fallback) {
        return fallback
      }

      // Default error UI based on level
      return this.renderDefaultErrorUI(error, errorId, level)
    }

    return children
  }

  private renderDefaultErrorUI(error: Error | null, errorId: string | null, level: string): ReactNode {
    const isDevelopment = process.env.NODE_ENV === 'development'

    if (level === 'critical') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900">
                  Application Error
                </h3>
                <p className="text-sm text-gray-500">
                  Something went wrong. Please refresh the page.
                </p>
              </div>
            </div>
            {isDevelopment && error && (
              <div className="mt-4 p-4 bg-gray-100 rounded text-sm font-mono text-gray-800 max-h-40 overflow-y-auto">
                <p className="font-semibold">Error: {error.message}</p>
                {error.stack && (
                  <pre className="mt-2 whitespace-pre-wrap text-xs">
                    {error.stack}
                  </pre>
                )}
              </div>
            )}
            <div className="mt-4 flex space-x-3">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
              >
                Reload Page
              </button>
              <button
                onClick={this.resetErrorBoundary}
                className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 transition-colors"
              >
                Try Again
              </button>
            </div>
            {errorId && (
              <p className="mt-4 text-xs text-gray-400 text-center">
                Error ID: {errorId}
              </p>
            )}
          </div>
        </div>
      )
    }

    if (level === 'page') {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
          <div className="text-center">
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              Page Error
            </h2>
            <p className="text-gray-600 mb-6">
              This page encountered an error and couldn't load properly.
            </p>
            {isDevelopment && error && (
              <div className="mb-6 p-4 bg-red-50 rounded-lg text-left max-w-lg">
                <p className="text-sm font-medium text-red-800 mb-2">
                  {error.message}
                </p>
                {error.stack && (
                  <pre className="text-xs text-red-700 overflow-x-auto">
                    {error.stack.split('\n').slice(0, 5).join('\n')}
                  </pre>
                )}
              </div>
            )}
            <div className="space-x-4">
              <button
                onClick={this.resetErrorBoundary}
                className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.history.back()}
                className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400 transition-colors"
              >
                Go Back
              </button>
            </div>
            {errorId && (
              <p className="mt-4 text-sm text-gray-400">
                Error ID: {errorId}
              </p>
            )}
          </div>
        </div>
      )
    }

    // Component level error
    return (
      <div className="border border-red-200 bg-red-50 rounded-lg p-4 my-4">
        <div className="flex">
          <svg className="w-5 h-5 text-red-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-red-800">
              Component Error
            </h3>
            <p className="text-sm text-red-700 mt-1">
              This component failed to load. {level === 'component' ? 'Retrying automatically...' : ''}
            </p>
            {isDevelopment && error && (
              <div className="mt-2 p-2 bg-red-100 rounded text-xs font-mono text-red-800">
                {error.message}
              </div>
            )}
            <button
              onClick={this.resetErrorBoundary}
              className="mt-2 text-sm text-red-600 underline hover:text-red-800"
            >
              Retry now
            </button>
            {errorId && (
              <p className="mt-1 text-xs text-red-500">
                ID: {errorId}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }
}

// Higher-order component for automatic error boundary wrapping
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  )

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`
  
  return WrappedComponent
}

// Hook for error handling in functional components
export function useErrorHandler() {
  return React.useCallback((error: Error, errorInfo?: any) => {
    const errorId = GlobalErrorHandler.captureException(error, {
      componentError: true,
      errorInfo
    })
    
    return errorId
  }, [])
}

// Initialize global error handling
if (typeof window !== 'undefined') {
  GlobalErrorHandler.initialize()
}