import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useResponsive } from '@/hooks/useResponsive'

interface TouchGestureHandler {
  onTap?: () => void
  onDoubleTap?: () => void
  onLongPress?: () => void
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  onPinch?: (scale: number) => void
  onRotate?: (angle: number) => void
}

interface TouchGestureOptions {
  tapThreshold?: number
  longPressDelay?: number
  swipeThreshold?: number
  doubleTapDelay?: number
  preventDefaults?: boolean
}

export function useTouchGestures(
  elementRef: React.RefObject<HTMLElement | null>,
  handlers: TouchGestureHandler,
  options: TouchGestureOptions = {}
) {
  const {
    tapThreshold = 10,
    longPressDelay = 500,
    swipeThreshold = 50,
    doubleTapDelay = 300,
    preventDefaults = true
  } = options

  const [touchData, setTouchData] = useState<{
    startTime: number
    startX: number
    startY: number
    lastTap: number
    longPressTimer?: NodeJS.Timeout
    touches: Touch[]
  }>({
    startTime: 0,
    startX: 0,
    startY: 0,
    lastTap: 0,
    touches: []
  })

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (preventDefaults) {
      e.preventDefault()
    }

    const touch = e.touches[0]
    if (!touch) return

    const now = Date.now()
    
    // Clear any existing long press timer
    if (touchData.longPressTimer) {
      clearTimeout(touchData.longPressTimer)
    }

    // Set up long press detection
    const longPressTimer = setTimeout(() => {
      handlers.onLongPress?.()
    }, longPressDelay)

    setTouchData({
      startTime: now,
      startX: touch.clientX,
      startY: touch.clientY,
      lastTap: touchData.lastTap,
      longPressTimer,
      touches: Array.from(e.touches)
    })
  }, [touchData.longPressTimer, touchData.lastTap, handlers, longPressDelay, preventDefaults])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (preventDefaults) {
      e.preventDefault()
    }

    // Cancel long press if user moves finger
    if (touchData.longPressTimer) {
      clearTimeout(touchData.longPressTimer)
      setTouchData(prev => ({ ...prev, longPressTimer: undefined }))
    }

    // Handle pinch/zoom gestures
    if (e.touches.length === 2 && touchData.touches.length === 2) {
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const prevTouch1 = touchData.touches[0]
      const prevTouch2 = touchData.touches[1]

      const currentDistance = Math.hypot(
        touch1.clientX - touch2.clientX,
        touch1.clientY - touch2.clientY
      )
      const previousDistance = Math.hypot(
        prevTouch1.clientX - prevTouch2.clientX,
        prevTouch1.clientY - prevTouch2.clientY
      )

      if (previousDistance > 0) {
        const scale = currentDistance / previousDistance
        handlers.onPinch?.(scale)
      }

      // Handle rotation
      const currentAngle = Math.atan2(
        touch2.clientY - touch1.clientY,
        touch2.clientX - touch1.clientX
      )
      const previousAngle = Math.atan2(
        prevTouch2.clientY - prevTouch1.clientY,
        prevTouch2.clientX - prevTouch1.clientX
      )

      const rotation = (currentAngle - previousAngle) * (180 / Math.PI)
      if (Math.abs(rotation) > 1) {
        handlers.onRotate?.(rotation)
      }
    }

    setTouchData(prev => ({
      ...prev,
      touches: Array.from(e.touches)
    }))
  }, [touchData.longPressTimer, touchData.touches, handlers, preventDefaults])

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (preventDefaults) {
      e.preventDefault()
    }

    const touch = e.changedTouches[0]
    if (!touch) return

    const now = Date.now()
    const duration = now - touchData.startTime
    const deltaX = touch.clientX - touchData.startX
    const deltaY = touch.clientY - touchData.startY
    const distance = Math.hypot(deltaX, deltaY)

    // Clear long press timer
    if (touchData.longPressTimer) {
      clearTimeout(touchData.longPressTimer)
    }

    // Handle tap gestures
    if (distance < tapThreshold && duration < longPressDelay) {
      const timeSinceLastTap = now - touchData.lastTap

      if (timeSinceLastTap < doubleTapDelay) {
        // Double tap
        handlers.onDoubleTap?.()
        setTouchData(prev => ({ ...prev, lastTap: 0 }))
      } else {
        // Single tap (with delay to detect double tap)
        setTimeout(() => {
          if (now - touchData.lastTap >= doubleTapDelay) {
            handlers.onTap?.()
          }
        }, doubleTapDelay)
        setTouchData(prev => ({ ...prev, lastTap: now }))
      }
    }
    // Handle swipe gestures
    else if (distance >= swipeThreshold) {
      const absX = Math.abs(deltaX)
      const absY = Math.abs(deltaY)

      if (absX > absY) {
        // Horizontal swipe
        if (deltaX > 0) {
          handlers.onSwipeRight?.()
        } else {
          handlers.onSwipeLeft?.()
        }
      } else {
        // Vertical swipe
        if (deltaY > 0) {
          handlers.onSwipeDown?.()
        } else {
          handlers.onSwipeUp?.()
        }
      }
    }

    setTouchData(prev => ({
      ...prev,
      longPressTimer: undefined,
      touches: []
    }))
  }, [
    touchData.startTime,
    touchData.startX,
    touchData.startY,
    touchData.longPressTimer,
    touchData.lastTap,
    handlers,
    tapThreshold,
    longPressDelay,
    swipeThreshold,
    doubleTapDelay,
    preventDefaults
  ])

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    element.addEventListener('touchstart', handleTouchStart, { passive: false })
    element.addEventListener('touchmove', handleTouchMove, { passive: false })
    element.addEventListener('touchend', handleTouchEnd, { passive: false })

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchmove', handleTouchMove)
      element.removeEventListener('touchend', handleTouchEnd)
    }
  }, [elementRef, handleTouchStart, handleTouchMove, handleTouchEnd])
}

interface SwipeableCardProps {
  children: React.ReactNode
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  className?: string
  threshold?: number
  showIndicators?: boolean
}

export function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  className = '',
  threshold = 100,
  showIndicators = true
}: SwipeableCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const { isTouch } = useResponsive()

  useTouchGestures(cardRef, {
    onSwipeLeft: () => {
      if (onSwipeLeft) {
        setIsAnimating(true)
        onSwipeLeft()
        setTimeout(() => {
          setIsAnimating(false)
          setSwipeOffset(0)
        }, 300)
      }
    },
    onSwipeRight: () => {
      if (onSwipeRight) {
        setIsAnimating(true)
        onSwipeRight()
        setTimeout(() => {
          setIsAnimating(false)
          setSwipeOffset(0)
        }, 300)
      }
    }
  })

  if (!isTouch) {
    return <div className={className}>{children}</div>
  }

  return (
    <div 
      ref={cardRef}
      className={`swipeable-card ${className} ${isAnimating ? 'animate-pulse' : ''}`}
      style={{
        transform: `translateX(${swipeOffset}px)`,
        transition: isAnimating ? 'transform 0.3s ease-out' : 'none'
      }}
    >
      {children}
      {showIndicators && (onSwipeLeft || onSwipeRight) && (
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex gap-1">
          {onSwipeLeft && (
            <div className="w-2 h-2 bg-gray-300 rounded-full opacity-50"></div>
          )}
          {onSwipeRight && (
            <div className="w-2 h-2 bg-gray-300 rounded-full opacity-50"></div>
          )}
        </div>
      )}
    </div>
  )
}

interface TouchScrollAreaProps {
  children: React.ReactNode
  height?: string
  showScrollbar?: boolean
  momentum?: boolean
  className?: string
}

export function TouchScrollArea({
  children,
  height = '100%',
  showScrollbar = false,
  momentum = true,
  className = ''
}: TouchScrollAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { isTouch } = useResponsive()

  const scrollAreaStyle: React.CSSProperties = {
    height,
    overflow: 'auto',
    ...(momentum && { WebkitOverflowScrolling: 'touch' }),
    ...(isTouch && !showScrollbar && {
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
      WebkitScrollbar: { display: 'none' }
    })
  }

  return (
    <div
      ref={scrollRef}
      className={`touch-scroll-area ${className}`}
      style={scrollAreaStyle}
    >
      {children}
    </div>
  )
}

interface VirtualizedListProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  itemHeight: number
  containerHeight: number
  overscan?: number
  className?: string
}

export function VirtualizedList<T>({
  items,
  renderItem,
  itemHeight,
  containerHeight,
  overscan = 5,
  className = ''
}: VirtualizedListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0)
  const scrollElementRef = useRef<HTMLDivElement>(null)

  const handleScroll = useCallback(() => {
    if (scrollElementRef.current) {
      setScrollTop(scrollElementRef.current.scrollTop)
    }
  }, [])

  const visibleStart = Math.floor(scrollTop / itemHeight)
  const visibleEnd = Math.min(
    visibleStart + Math.ceil(containerHeight / itemHeight),
    items.length - 1
  )

  const startIndex = Math.max(0, visibleStart - overscan)
  const endIndex = Math.min(items.length - 1, visibleEnd + overscan)

  const visibleItems = items.slice(startIndex, endIndex + 1)

  return (
    <div
      ref={scrollElementRef}
      className={`virtualized-list ${className}`}
      style={{
        height: containerHeight,
        overflow: 'auto',
        WebkitOverflowScrolling: 'touch'
      }}
      onScroll={handleScroll}
    >
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        <div
          style={{
            transform: `translateY(${startIndex * itemHeight}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0
          }}
        >
          {visibleItems.map((item, index) => (
            <div
              key={startIndex + index}
              style={{ height: itemHeight }}
            >
              {renderItem(item, startIndex + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface PullToRefreshProps {
  children: React.ReactNode
  onRefresh: () => Promise<void>
  threshold?: number
  className?: string
}

export function PullToRefresh({
  children,
  onRefresh,
  threshold = 100,
  className = ''
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { isTouch } = useResponsive()

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!containerRef.current || containerRef.current.scrollTop > 0) return
    
    const touch = e.touches[0]
    if (touch) {
      // Store initial touch position
      containerRef.current.dataset.startY = touch.clientY.toString()
    }
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!containerRef.current || isRefreshing) return
    
    const startY = parseFloat(containerRef.current.dataset.startY || '0')
    const currentY = e.touches[0]?.clientY || 0
    const distance = currentY - startY

    if (distance > 0 && containerRef.current.scrollTop === 0) {
      e.preventDefault()
      setPullDistance(Math.min(distance, threshold * 1.5))
    }
  }, [threshold, isRefreshing])

  const handleTouchEnd = useCallback(async () => {
    if (!containerRef.current) return

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true)
      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }

    delete containerRef.current.dataset.startY
  }, [pullDistance, threshold, isRefreshing, onRefresh])

  useEffect(() => {
    const element = containerRef.current
    if (!element || !isTouch) return

    element.addEventListener('touchstart', handleTouchStart, { passive: false })
    element.addEventListener('touchmove', handleTouchMove, { passive: false })
    element.addEventListener('touchend', handleTouchEnd)

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchmove', handleTouchMove)
      element.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isTouch, handleTouchStart, handleTouchMove, handleTouchEnd])

  const refreshIndicatorStyle: React.CSSProperties = {
    transform: `translateY(${pullDistance}px)`,
    opacity: Math.min(pullDistance / threshold, 1),
    transition: isRefreshing || pullDistance === 0 ? 'transform 0.3s ease-out' : 'none'
  }

  return (
    <div ref={containerRef} className={`pull-to-refresh ${className}`}>
      {isTouch && (
        <div
          className="refresh-indicator flex items-center justify-center py-4"
          style={refreshIndicatorStyle}
        >
          {isRefreshing ? (
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          ) : (
            <div className="text-gray-500 text-sm">
              {pullDistance >= threshold ? 'Release to refresh' : 'Pull to refresh'}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  )
}