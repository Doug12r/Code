import React from 'react'

interface SkeletonProps {
  className?: string
  variant?: 'default' | 'circular' | 'rectangular' | 'text'
  width?: string | number
  height?: string | number
  animation?: 'pulse' | 'wave' | 'none'
}

export function Skeleton({ 
  className = '', 
  variant = 'default',
  width,
  height,
  animation = 'pulse'
}: SkeletonProps) {
  const baseClasses = 'bg-gray-200 dark:bg-gray-700'
  
  const variantClasses = {
    default: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-none',
    text: 'rounded h-4'
  }

  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-wave',
    none: ''
  }

  const style: React.CSSProperties = {}
  if (width) style.width = width
  if (height) style.height = height

  return (
    <div
      className={`
        ${baseClasses} 
        ${variantClasses[variant]} 
        ${animationClasses[animation]}
        ${className}
      `}
      style={style}
    />
  )
}

// Skeleton components for common UI patterns
export function MediaCardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton variant="rectangular" className="w-full aspect-video" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  )
}

export function VideoPlayerSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton variant="rectangular" className="w-full aspect-video" />
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Skeleton variant="circular" className="w-8 h-8" />
          <Skeleton className="h-6 w-16" />
          <Skeleton variant="circular" className="w-8 h-8" />
          <Skeleton className="h-4 w-12" />
        </div>
        <div className="flex items-center space-x-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton variant="circular" className="w-8 h-8" />
          <Skeleton variant="circular" className="w-8 h-8" />
        </div>
      </div>
    </div>
  )
}

export function LibrarySkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <MediaCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

export function RoomListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center space-x-4 p-4 border rounded-lg">
          <Skeleton variant="circular" className="w-12 h-12" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-6 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-32" />
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-6 border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton variant="circular" className="w-8 h-8" />
            </div>
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <RoomListSkeleton />
      </div>
    </div>
  )
}

// Loading text with dots animation
export function LoadingText({ 
  text = 'Loading',
  className = ''
}: { 
  text?: string
  className?: string 
}) {
  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      <span>{text}</span>
      <div className="flex space-x-1">
        <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}

// Contextual loading messages
export function ContextualLoader({ 
  type,
  message,
  progress,
  className = ''
}: {
  type: 'media' | 'plex' | 'room' | 'transcoding' | 'buffering' | 'sync'
  message?: string
  progress?: number
  className?: string
}) {
  const defaultMessages = {
    media: 'Loading media library...',
    plex: 'Connecting to Plex server...',
    room: 'Joining watch room...',
    transcoding: 'Processing video...',
    buffering: 'Optimizing stream...',
    sync: 'Synchronizing playback...'
  }

  const icons = {
    media: '🎬',
    plex: '📺', 
    room: '👥',
    transcoding: '⚙️',
    buffering: '📊',
    sync: '🔄'
  }

  return (
    <div className={`flex flex-col items-center space-y-4 p-8 ${className}`}>
      <div className="text-4xl animate-pulse">
        {icons[type]}
      </div>
      
      <div className="text-center">
        <LoadingText 
          text={message || defaultMessages[type]}
          className="text-lg font-medium"
        />
      </div>

      {progress !== undefined && (
        <div className="w-full max-w-xs">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// Full page loading overlay
export function LoadingOverlay({ 
  visible,
  type = 'media',
  message,
  progress,
  onCancel
}: {
  visible: boolean
  type?: 'media' | 'plex' | 'room' | 'transcoding' | 'buffering' | 'sync'
  message?: string
  progress?: number
  onCancel?: () => void
}) {
  if (!visible) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
        <ContextualLoader 
          type={type}
          message={message}
          progress={progress}
        />
        
        {onCancel && (
          <div className="p-4 border-t flex justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}