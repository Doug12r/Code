import React, { Component, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  AlertTriangle, 
  RefreshCw, 
  Bug, 
  Home, 
  ArrowLeft, 
  ExternalLink,
  Copy,
  MessageCircle
} from 'lucide-react'
import { SmoothTransition } from './transitions'

export interface ErrorInfo {
  componentStack: string
  errorBoundary?: string
  errorInfo?: string
}

export interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  errorId: string
  retryCount: number
  isRecovering: boolean
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  enableRetry?: boolean
  maxRetries?: number
  resetOnPropsChange?: boolean
  resetKeys?: Array<string | number>
  isolate?: boolean
  context?: string
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private resetTimeoutId: number | null = null

  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
      retryCount: 0,
      isRecovering: false
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const enhancedErrorInfo: ErrorInfo = {
      componentStack: errorInfo.componentStack || '',
      errorBoundary: this.props.context || 'Unknown',
      errorInfo: JSON.stringify(errorInfo)
    }

    this.setState({
      errorInfo: enhancedErrorInfo
    })

    // Report error to monitoring service
    this.reportError(error, enhancedErrorInfo)
    
    // Call custom error handler
    this.props.onError?.(error, enhancedErrorInfo)
    
    console.error('ErrorBoundary caught an error:', error, enhancedErrorInfo)
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    const { resetOnPropsChange, resetKeys } = this.props
    const { hasError } = this.state

    if (hasError && resetOnPropsChange) {
      if (resetKeys) {
        const hasResetKeyChanged = resetKeys.some(
          (key, index) => key !== (prevProps.resetKeys?.[index])
        )
        if (hasResetKeyChanged) {
          this.resetError()
        }
      } else {
        this.resetError()
      }
    }
  }

  private reportError = (error: Error, errorInfo: ErrorInfo) => {
    // In a real app, send to monitoring service like Sentry
    const errorReport = {
      message: error.message,
      stack: error.stack,
      errorId: this.state.errorId,
      context: this.props.context,
      componentStack: errorInfo.componentStack,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      retryCount: this.state.retryCount
    }

    // Send to monitoring service
    if (typeof window !== 'undefined') {
      try {
        fetch('/api/errors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(errorReport)
        }).catch(console.error)
      } catch (e) {
        console.error('Failed to report error:', e)
      }
    }
  }

  private resetError = () => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId)
    }

    this.setState({ isRecovering: true })
    
    this.resetTimeoutId = window.setTimeout(() => {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        isRecovering: false
      })
    }, 300)
  }

  private handleRetry = () => {
    const { maxRetries = 3 } = this.props
    const { retryCount } = this.state

    if (retryCount < maxRetries) {
      this.setState(
        prevState => ({
          retryCount: prevState.retryCount + 1
        }),
        () => {
          this.resetError()
        }
      )
    }
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  private handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/'
    }
  }

  private handleGoBack = () => {
    if (typeof window !== 'undefined') {
      window.history.back()
    }
  }

  private copyErrorDetails = () => {
    const { error, errorInfo, errorId } = this.state
    const errorText = `
Error ID: ${errorId}
Message: ${error?.message || 'Unknown error'}
Context: ${this.props.context || 'Unknown'}

Stack Trace:
${error?.stack || 'No stack trace available'}

Component Stack:
${errorInfo?.componentStack || 'No component stack available'}
    `.trim()

    if (navigator.clipboard) {
      navigator.clipboard.writeText(errorText)
      // Show toast notification
      console.log('Error details copied to clipboard')
    }
  }

  render() {
    const { children, fallback, enableRetry = true, maxRetries = 3, isolate = false } = this.props
    const { hasError, error, errorInfo, errorId, retryCount, isRecovering } = this.state

    if (hasError && !isRecovering) {
      if (fallback) {
        return fallback
      }

      const canRetry = enableRetry && retryCount < maxRetries
      const errorType = this.getErrorType(error)
      const errorSeverity = this.getErrorSeverity(error)

      return (
        <SmoothTransition show={true} type="fade">
          <div className={`${isolate ? 'p-4' : 'min-h-[400px] flex items-center justify-center p-8'}`}>
            <Card className="w-full max-w-2xl">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${
                    errorSeverity === 'critical' ? 'bg-red-100 text-red-600' :
                    errorSeverity === 'error' ? 'bg-orange-100 text-orange-600' :
                    'bg-yellow-100 text-yellow-600'
                  }`}>
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">
                      {errorSeverity === 'critical' ? 'Critical Error' :
                       errorSeverity === 'error' ? 'Application Error' :
                       'Something went wrong'}
                    </CardTitle>
                    <CardDescription>
                      {this.getErrorDescription(errorType)}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Error Details */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">
                      {errorId}
                    </Badge>
                    <Badge variant={errorSeverity === 'critical' ? 'destructive' : 'secondary'}>
                      {errorType}
                    </Badge>
                    {retryCount > 0 && (
                      <Badge variant="outline">
                        Retry {retryCount}/{maxRetries}
                      </Badge>
                    )}
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                      Error Message:
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 font-mono">
                      {error?.message || 'Unknown error occurred'}
                    </p>
                  </div>

                  {this.props.context && (
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Location: <span className="font-medium">{this.props.context}</span>
                    </div>
                  )}
                </div>

                {/* Recovery Actions */}
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {canRetry && (
                      <Button 
                        onClick={this.handleRetry}
                        className="gap-2"
                        variant="default"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Try Again ({maxRetries - retryCount} left)
                      </Button>
                    )}

                    <Button 
                      onClick={this.handleReload}
                      variant="outline"
                      className="gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Reload Page
                    </Button>

                    {!isolate && (
                      <>
                        <Button 
                          onClick={this.handleGoBack}
                          variant="outline"
                          className="gap-2"
                        >
                          <ArrowLeft className="w-4 h-4" />
                          Go Back
                        </Button>

                        <Button 
                          onClick={this.handleGoHome}
                          variant="outline"
                          className="gap-2"
                        >
                          <Home className="w-4 h-4" />
                          Go Home
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Technical Details */}
                  <details className="text-sm">
                    <summary className="cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                      Technical Details
                    </summary>
                    <div className="mt-2 space-y-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={this.copyErrorDetails}
                          className="gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          Copy Details
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          asChild
                        >
                          <a href={`https://github.com/issues/new?title=Error: ${error?.message}`} target="_blank" className="gap-1">
                            <Bug className="w-3 h-3" />
                            Report Bug
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </Button>
                      </div>

                      {error?.stack && (
                        <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-32">
                          {error.stack}
                        </pre>
                      )}

                      {errorInfo?.componentStack && (
                        <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-32">
                          {errorInfo.componentStack}
                        </pre>
                      )}
                    </div>
                  </details>
                </div>

                {/* Help and Support */}
                <div className="border-t pt-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Need help? Try these resources:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <a href="/help" className="gap-1">
                        <MessageCircle className="w-3 h-3" />
                        Help Center
                      </a>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href="/contact" className="gap-1">
                        Contact Support
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </SmoothTransition>
      )
    }

    if (isRecovering) {
      return (
        <SmoothTransition show={true} type="fade">
          <div className="flex items-center justify-center p-8">
            <div className="text-center space-y-2">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600" />
              <p className="text-sm text-gray-600">Recovering...</p>
            </div>
          </div>
        </SmoothTransition>
      )
    }

    return children
  }

  private getErrorType(error: Error | null): string {
    if (!error) return 'Unknown'
    
    const message = error.message.toLowerCase()
    const name = error.name.toLowerCase()
    
    if (name.includes('chunk') || message.includes('chunk')) return 'Chunk Load Error'
    if (name.includes('network') || message.includes('network')) return 'Network Error'
    if (name.includes('reference') || message.includes('undefined')) return 'Reference Error'
    if (name.includes('syntax')) return 'Syntax Error'
    if (message.includes('fetch') || message.includes('api')) return 'API Error'
    if (message.includes('plex')) return 'Plex Connection Error'
    if (message.includes('socket')) return 'WebSocket Error'
    
    return error.name || 'Runtime Error'
  }

  private getErrorSeverity(error: Error | null): 'critical' | 'error' | 'warning' {
    if (!error) return 'error'
    
    const message = error.message.toLowerCase()
    const name = error.name.toLowerCase()
    
    if (name.includes('chunk') || message.includes('chunk')) return 'warning'
    if (message.includes('network') || message.includes('fetch')) return 'warning'
    if (message.includes('plex')) return 'warning'
    
    return 'error'
  }

  private getErrorDescription(errorType: string): string {
    const descriptions: Record<string, string> = {
      'Chunk Load Error': 'Failed to load application resources. This usually happens after an app update.',
      'Network Error': 'Unable to connect to the server. Check your internet connection.',
      'Reference Error': 'A programming error occurred. This has been reported to our team.',
      'Syntax Error': 'Invalid code detected. This has been reported to our team.',
      'API Error': 'Server communication failed. Please try again in a moment.',
      'Plex Connection Error': 'Unable to connect to your Plex server. Check your Plex settings.',
      'WebSocket Error': 'Real-time connection lost. Attempting to reconnect...',
      'Runtime Error': 'An unexpected error occurred during execution.'
    }
    
    return descriptions[errorType] || 'An unexpected error occurred. Our team has been notified.'
  }
}

// Specialized error boundaries for different contexts
export function MediaErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      context="Media Library"
      enableRetry={true}
      maxRetries={2}
      isolate={true}
    >
      {children}
    </ErrorBoundary>
  )
}

export function RoomErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      context="Watch Room"
      enableRetry={true}
      maxRetries={3}
      isolate={true}
    >
      {children}
    </ErrorBoundary>
  )
}

export function PlexErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      context="Plex Connection"
      enableRetry={true}
      maxRetries={2}
      isolate={true}
    >
      {children}
    </ErrorBoundary>
  )
}

export function VideoPlayerErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      context="Video Player"
      enableRetry={true}
      maxRetries={1}
      isolate={true}
    >
      {children}
    </ErrorBoundary>
  )
}

// Global error boundary for the entire app
export function GlobalErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      context="Application Root"
      enableRetry={true}
      maxRetries={1}
      isolate={false}
    >
      {children}
    </ErrorBoundary>
  )
}