import React, { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { CheckCircle, AlertCircle, AlertTriangle, Info, Loader2, Upload, X } from 'lucide-react'

export type FeedbackState = 'idle' | 'loading' | 'success' | 'error' | 'warning'

interface FeedbackProps {
  state: FeedbackState
  message?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
  inline?: boolean
}

export function FeedbackIndicator({ 
  state, 
  message, 
  className = '', 
  size = 'md', 
  inline = false 
}: FeedbackProps) {
  const getIcon = () => {
    const iconSize = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5'
    
    switch (state) {
      case 'loading':
        return <Loader2 className={cn(iconSize, 'animate-spin text-blue-500')} />
      case 'success':
        return <CheckCircle className={cn(iconSize, 'text-green-500')} />
      case 'error':
        return <AlertCircle className={cn(iconSize, 'text-red-500')} />
      case 'warning':
        return <AlertTriangle className={cn(iconSize, 'text-yellow-500')} />
      default:
        return null
    }
  }

  const getTextColor = () => {
    switch (state) {
      case 'success':
        return 'text-green-600'
      case 'error':
        return 'text-red-600'
      case 'warning':
        return 'text-yellow-600'
      case 'loading':
        return 'text-blue-600'
      default:
        return 'text-gray-600'
    }
  }

  if (state === 'idle') return null

  return (
    <div className={cn(
      'feedback-indicator flex items-center',
      inline ? 'gap-2' : 'gap-3',
      className
    )}>
      {getIcon()}
      {message && (
        <span className={cn(
          'font-medium',
          size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-base' : 'text-sm',
          getTextColor()
        )}>
          {message}
        </span>
      )}
    </div>
  )
}

interface ProgressFeedbackProps {
  progress: number
  message?: string
  variant?: 'bar' | 'circular' | 'steps'
  steps?: string[]
  currentStep?: number
  className?: string
}

export function ProgressFeedback({
  progress,
  message,
  variant = 'bar',
  steps,
  currentStep = 0,
  className = ''
}: ProgressFeedbackProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress))

  if (variant === 'circular') {
    const circumference = 2 * Math.PI * 45
    const strokeDasharray = circumference
    const strokeDashoffset = circumference - (clampedProgress / 100) * circumference

    return (
      <div className={cn('progress-circular flex flex-col items-center', className)}>
        <div className="relative w-24 h-24">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="45"
              stroke="currentColor"
              strokeWidth="10"
              fill="transparent"
              className="text-gray-200"
            />
            <circle
              cx="50"
              cy="50"
              r="45"
              stroke="currentColor"
              strokeWidth="10"
              fill="transparent"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              className="text-blue-600 transition-all duration-300"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-semibold text-gray-900">
              {Math.round(clampedProgress)}%
            </span>
          </div>
        </div>
        {message && (
          <p className="mt-2 text-sm text-gray-600 text-center">{message}</p>
        )}
      </div>
    )
  }

  if (variant === 'steps' && steps) {
    return (
      <div className={cn('progress-steps', className)}>
        <div className="flex items-center justify-between mb-4">
          {steps.map((step, index) => (
            <div key={index} className="flex flex-col items-center flex-1">
              <div className={cn(
                'w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-medium transition-colors',
                {
                  'bg-blue-600 border-blue-600 text-white': index <= currentStep,
                  'border-gray-300 text-gray-500': index > currentStep
                }
              )}>
                {index <= currentStep ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span className={cn(
                'mt-2 text-xs text-center',
                index <= currentStep ? 'text-blue-600 font-medium' : 'text-gray-500'
              )}>
                {step}
              </span>
            </div>
          ))}
        </div>
        {message && (
          <p className="text-sm text-gray-600 text-center">{message}</p>
        )}
      </div>
    )
  }

  return (
    <div className={cn('progress-bar', className)}>
      <div className="flex justify-between items-center mb-2">
        {message && (
          <span className="text-sm font-medium text-gray-700">{message}</span>
        )}
        <span className="text-sm text-gray-500">{Math.round(clampedProgress)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  )
}

interface FileUploadFeedbackProps {
  files: Array<{
    name: string
    progress: number
    status: 'uploading' | 'success' | 'error'
    error?: string
  }>
  onRetry?: (fileName: string) => void
  onRemove?: (fileName: string) => void
  className?: string
}

export function FileUploadFeedback({
  files,
  onRetry,
  onRemove,
  className = ''
}: FileUploadFeedbackProps) {
  return (
    <div className={cn('file-upload-feedback space-y-3', className)}>
      {files.map((file, index) => (
        <div key={index} className="border border-gray-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-900 truncate">
                {file.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {file.status === 'uploading' && (
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              )}
              {file.status === 'success' && (
                <CheckCircle className="w-4 h-4 text-green-500" />
              )}
              {file.status === 'error' && (
                <AlertCircle className="w-4 h-4 text-red-500" />
              )}
              {onRemove && (
                <button
                  onClick={() => onRemove(file.name)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          
          {file.status === 'uploading' && (
            <ProgressFeedback progress={file.progress} variant="bar" />
          )}
          
          {file.status === 'error' && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-red-600">{file.error || 'Upload failed'}</span>
              {onRetry && (
                <button
                  onClick={() => onRetry(file.name)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
          )}
          
          {file.status === 'success' && (
            <span className="text-sm text-green-600">Upload complete</span>
          )}
        </div>
      ))}
    </div>
  )
}

interface FormFeedbackProps {
  children: React.ReactNode
  state: FeedbackState
  message?: string
  className?: string
}

export function FormFeedback({ children, state, message, className = '' }: FormFeedbackProps) {
  return (
    <div className={cn('form-feedback', className)}>
      {children}
      {state !== 'idle' && (
        <div className="mt-2">
          <FeedbackIndicator state={state} message={message} size="sm" inline />
        </div>
      )}
    </div>
  )
}

interface ActionFeedbackProps {
  onAction: () => Promise<void>
  children: (state: FeedbackState, trigger: () => void) => React.ReactNode
  successMessage?: string
  errorMessage?: string
  onSuccess?: () => void
  onError?: (error: Error) => void
}

export function ActionFeedback({
  onAction,
  children,
  successMessage = 'Action completed successfully',
  errorMessage = 'Action failed',
  onSuccess,
  onError
}: ActionFeedbackProps) {
  const [state, setState] = useState<FeedbackState>('idle')

  const trigger = useCallback(async () => {
    setState('loading')
    
    try {
      await onAction()
      setState('success')
      onSuccess?.()
      
      // Reset to idle after 3 seconds
      setTimeout(() => setState('idle'), 3000)
    } catch (error) {
      setState('error')
      onError?.(error as Error)
      
      // Reset to idle after 5 seconds
      setTimeout(() => setState('idle'), 5000)
    }
  }, [onAction, onSuccess, onError])

  return (
    <>
      {children(state, trigger)}
      <FeedbackIndicator
        state={state}
        message={state === 'success' ? successMessage : state === 'error' ? errorMessage : undefined}
      />
    </>
  )
}

interface ConnectionStatusProps {
  isOnline: boolean
  isConnected: boolean
  reconnectAttempts?: number
  onReconnect?: () => void
  className?: string
}

export function ConnectionStatus({
  isOnline,
  isConnected,
  reconnectAttempts = 0,
  onReconnect,
  className = ''
}: ConnectionStatusProps) {
  const getStatus = () => {
    if (!isOnline) return { type: 'error' as const, message: 'No internet connection' }
    if (!isConnected && reconnectAttempts > 0) {
      return { type: 'warning' as const, message: `Reconnecting... (${reconnectAttempts})` }
    }
    if (!isConnected) return { type: 'error' as const, message: 'Connection lost' }
    return { type: 'success' as const, message: 'Connected' }
  }

  const status = getStatus()

  return (
    <div className={cn('connection-status flex items-center gap-2', className)}>
      <div className={cn(
        'w-2 h-2 rounded-full',
        {
          'bg-green-500': status.type === 'success',
          'bg-yellow-500 animate-pulse': status.type === 'warning',
          'bg-red-500': status.type === 'error'
        }
      )} />
      <span className="text-sm text-gray-600">{status.message}</span>
      {!isConnected && onReconnect && (
        <button
          onClick={onReconnect}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  )
}