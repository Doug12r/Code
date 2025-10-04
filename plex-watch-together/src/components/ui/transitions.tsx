import React, { useState, useEffect } from 'react'

interface SmoothTransitionProps {
  show: boolean
  children: React.ReactNode
  duration?: number
  className?: string
  type?: 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'scale' | 'rotate'
  delay?: number
}

export function SmoothTransition({
  show,
  children,
  duration = 300,
  className = '',
  type = 'fade',
  delay = 0
}: SmoothTransitionProps) {
  const [shouldRender, setShouldRender] = useState(show)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    let timeoutId: NodeJS.Timeout

    if (show) {
      setShouldRender(true)
      timeoutId = setTimeout(() => {
        setIsVisible(true)
      }, delay)
    } else {
      setIsVisible(false)
      timeoutId = setTimeout(() => {
        setShouldRender(false)
      }, duration)
    }

    return () => clearTimeout(timeoutId)
  }, [show, duration, delay])

  if (!shouldRender) return null

  const getTransitionClasses = () => {
    const baseClasses = `transition-all ease-in-out`
    const durationClass = `duration-${duration}`
    
    const variants = {
      fade: isVisible ? 'opacity-100' : 'opacity-0',
      'slide-up': isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
      'slide-down': isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4',
      'slide-left': isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4',
      'slide-right': isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4',
      scale: isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95',
      rotate: isVisible ? 'opacity-100 rotate-0' : 'opacity-0 rotate-12'
    }

    return `${baseClasses} ${durationClass} ${variants[type]} ${className}`
  }

  return (
    <div className={getTransitionClasses()}>
      {children}
    </div>
  )
}

// Staggered children animation
export function StaggeredTransition({
  show,
  children,
  staggerDelay = 100,
  className = ''
}: {
  show: boolean
  children: React.ReactNode[]
  staggerDelay?: number
  className?: string
}) {
  return (
    <div className={className}>
      {React.Children.map(children, (child, index) => (
        <SmoothTransition
          key={index}
          show={show}
          delay={index * staggerDelay}
          type="slide-up"
        >
          {child}
        </SmoothTransition>
      ))}
    </div>
  )
}

// Enhanced Progress Component
interface EnhancedProgressProps {
  value: number
  max?: number
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'success' | 'warning' | 'error' | 'gradient'
  showPercentage?: boolean
  showLabel?: boolean
  label?: string
  animated?: boolean
  striped?: boolean
  className?: string
}

export function EnhancedProgress({
  value,
  max = 100,
  size = 'md',
  variant = 'default',
  showPercentage = false,
  showLabel = false,
  label,
  animated = false,
  striped = false,
  className = ''
}: EnhancedProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100))

  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-4'
  }

  const variantClasses = {
    default: 'bg-blue-600',
    success: 'bg-green-600',
    warning: 'bg-yellow-600', 
    error: 'bg-red-600',
    gradient: 'bg-gradient-to-r from-blue-600 to-purple-600'
  }

  const getProgressClasses = () => {
    let classes = `${sizeClasses[size]} ${variantClasses[variant]} transition-all duration-500 ease-out`
    
    if (animated) {
      classes += ' animate-pulse'
    }
    
    if (striped) {
      classes += ' bg-stripes'
    }

    return classes
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {(showLabel || label) && (
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-700 dark:text-gray-300">
            {label || 'Progress'}
          </span>
          {showPercentage && (
            <span className="text-gray-600 dark:text-gray-400 font-medium">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
      
      <div className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden ${sizeClasses[size]}`}>
        <div
          className={`${getProgressClasses()} rounded-full h-full`}
          style={{ 
            width: `${percentage}%`,
            transition: 'width 0.5s ease-out'
          }}
        />
      </div>
    </div>
  )
}

// Circular Progress
export function CircularProgress({
  value,
  max = 100,
  size = 64,
  strokeWidth = 4,
  variant = 'default',
  showPercentage = true,
  className = ''
}: {
  value: number
  max?: number
  size?: number
  strokeWidth?: number
  variant?: 'default' | 'success' | 'warning' | 'error'
  showPercentage?: boolean
  className?: string
}) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percentage / 100) * circumference

  const colors = {
    default: '#3B82F6',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444'
  }

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-gray-200 dark:text-gray-700"
        />
        
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors[variant]}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      
      {showPercentage && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {Math.round(percentage)}%
          </span>
        </div>
      )}
    </div>
  )
}

// Loading States with smooth transitions
export function LoadingStateDisplay({
  isLoading,
  error,
  success,
  children,
  loadingComponent,
  errorComponent,
  successComponent,
  className = ''
}: {
  isLoading: boolean
  error?: string | null
  success?: boolean
  children: React.ReactNode
  loadingComponent?: React.ReactNode
  errorComponent?: React.ReactNode
  successComponent?: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <SmoothTransition show={isLoading} type="fade">
        {loadingComponent || (
          <div className="flex items-center justify-center p-8">
            <CircularProgress value={75} />
          </div>
        )}
      </SmoothTransition>

      <SmoothTransition show={!!error} type="slide-up">
        {errorComponent || (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}
      </SmoothTransition>

      <SmoothTransition show={success === true} type="slide-up">
        {successComponent || (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-800">Operation completed successfully!</p>
          </div>
        )}
      </SmoothTransition>

      <SmoothTransition show={!isLoading && !error && success !== true} type="fade">
        {children}
      </SmoothTransition>
    </div>
  )
}

// Page transition wrapper
export function PageTransition({
  children,
  className = ''
}: {
  children: React.ReactNode
  className?: string
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <SmoothTransition
      show={mounted}
      type="fade"
      duration={300}
      className={className}
    >
      {children}
    </SmoothTransition>
  )
}