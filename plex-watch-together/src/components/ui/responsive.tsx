import React from 'react'
import { useResponsive, BreakpointKey } from '@/hooks/useResponsive'

interface ResponsiveGridProps {
  children: React.ReactNode
  columns?: Partial<Record<BreakpointKey, number>> | number
  gap?: Partial<Record<BreakpointKey, number>> | number
  className?: string
  minItemWidth?: number
  autoFit?: boolean
}

export function ResponsiveGrid({
  children,
  columns = { xs: 1, sm: 2, md: 3, lg: 4, xl: 6 },
  gap = { xs: 2, md: 4 },
  className = '',
  minItemWidth,
  autoFit = false
}: ResponsiveGridProps) {
  const { getResponsiveValue } = useResponsive()

  const columnCount = getResponsiveValue(columns)
  const gapSize = getResponsiveValue(gap)

  const gridStyle: React.CSSProperties = autoFit && minItemWidth
    ? {
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${minItemWidth}px, 1fr))`,
        gap: `${gapSize * 0.25}rem`
      }
    : {
        display: 'grid',
        gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
        gap: `${gapSize * 0.25}rem`
      }

  return (
    <div
      className={`responsive-grid ${className}`}
      style={gridStyle}
    >
      {children}
    </div>
  )
}

interface ResponsiveContainerProps {
  children: React.ReactNode
  maxWidth?: Partial<Record<BreakpointKey, string>> | string
  padding?: Partial<Record<BreakpointKey, number>> | number
  className?: string
  fluid?: boolean
  centerContent?: boolean
}

export function ResponsiveContainer({
  children,
  maxWidth = { xs: '100%', sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1536px' },
  padding = { xs: 4, md: 6, lg: 8 },
  className = '',
  fluid = false,
  centerContent = false
}: ResponsiveContainerProps) {
  const { getResponsiveValue } = useResponsive()

  const containerMaxWidth = fluid ? '100%' : getResponsiveValue(maxWidth)
  const containerPadding = getResponsiveValue(padding)

  const containerStyle: React.CSSProperties = {
    maxWidth: containerMaxWidth,
    padding: `0 ${containerPadding * 0.25}rem`,
    marginLeft: 'auto',
    marginRight: 'auto',
    ...(centerContent && {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    })
  }

  return (
    <div
      className={`responsive-container ${className}`}
      style={containerStyle}
    >
      {children}
    </div>
  )
}

interface ResponsiveStackProps {
  children: React.ReactNode
  direction?: Partial<Record<BreakpointKey, 'row' | 'column'>> | 'row' | 'column'
  gap?: Partial<Record<BreakpointKey, number>> | number
  align?: 'start' | 'center' | 'end' | 'stretch'
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'
  wrap?: boolean
  className?: string
}

export function ResponsiveStack({
  children,
  direction = 'column',
  gap = 4,
  align = 'stretch',
  justify = 'start',
  wrap = false,
  className = ''
}: ResponsiveStackProps) {
  const { getResponsiveValue } = useResponsive()

  const stackDirection = getResponsiveValue(direction)
  const stackGap = getResponsiveValue(gap)

  const alignItemsMap = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    stretch: 'stretch'
  }

  const justifyContentMap = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    between: 'space-between',
    around: 'space-around',
    evenly: 'space-evenly'
  }

  const stackStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: stackDirection,
    gap: `${stackGap * 0.25}rem`,
    alignItems: alignItemsMap[align],
    justifyContent: justifyContentMap[justify],
    ...(wrap && { flexWrap: 'wrap' })
  }

  return (
    <div
      className={`responsive-stack ${className}`}
      style={stackStyle}
    >
      {children}
    </div>
  )
}

interface ResponsiveShowProps {
  children: React.ReactNode
  breakpoints?: BreakpointKey[]
  above?: BreakpointKey
  below?: BreakpointKey
  only?: BreakpointKey | BreakpointKey[]
}

export function ResponsiveShow({
  children,
  breakpoints,
  above,
  below,
  only
}: ResponsiveShowProps) {
  const { viewport, isBreakpointUp, isBreakpointDown, isBreakpoint } = useResponsive()

  let shouldShow = false

  if (breakpoints) {
    shouldShow = breakpoints.includes(viewport.breakpoint)
  } else if (above) {
    shouldShow = isBreakpointUp(above)
  } else if (below) {
    shouldShow = isBreakpointDown(below)
  } else if (only) {
    if (Array.isArray(only)) {
      shouldShow = only.includes(viewport.breakpoint)
    } else {
      shouldShow = isBreakpoint(only)
    }
  }

  if (!shouldShow) return null

  return <>{children}</>
}

interface ResponsiveHideProps {
  children: React.ReactNode
  breakpoints?: BreakpointKey[]
  above?: BreakpointKey
  below?: BreakpointKey
  only?: BreakpointKey | BreakpointKey[]
}

export function ResponsiveHide({
  children,
  breakpoints,
  above,
  below,
  only
}: ResponsiveHideProps) {
  const { viewport, isBreakpointUp, isBreakpointDown, isBreakpoint } = useResponsive()

  let shouldHide = false

  if (breakpoints) {
    shouldHide = breakpoints.includes(viewport.breakpoint)
  } else if (above) {
    shouldHide = isBreakpointUp(above)
  } else if (below) {
    shouldHide = isBreakpointDown(below)
  } else if (only) {
    if (Array.isArray(only)) {
      shouldHide = only.includes(viewport.breakpoint)
    } else {
      shouldHide = isBreakpoint(only)
    }
  }

  if (shouldHide) return null

  return <>{children}</>
}

interface TouchOptimizedProps {
  children: React.ReactNode
  minTouchSize?: number
  touchPadding?: number
  className?: string
}

export function TouchOptimized({
  children,
  minTouchSize = 44,
  touchPadding = 8,
  className = ''
}: TouchOptimizedProps) {
  const { isTouch } = useResponsive()

  const touchStyle: React.CSSProperties = isTouch
    ? {
        minWidth: `${minTouchSize}px`,
        minHeight: `${minTouchSize}px`,
        padding: `${touchPadding}px`,
        cursor: 'pointer'
      }
    : {}

  return (
    <div
      className={`touch-optimized ${className}`}
      style={touchStyle}
    >
      {children}
    </div>
  )
}

interface AdaptiveTextProps {
  children: React.ReactNode
  size?: Partial<Record<BreakpointKey, string>> | string
  weight?: Partial<Record<BreakpointKey, string>> | string
  lineHeight?: Partial<Record<BreakpointKey, string>> | string
  className?: string
  truncate?: boolean | Partial<Record<BreakpointKey, boolean>>
}

export function AdaptiveText({
  children,
  size = { xs: 'text-sm', md: 'text-base', lg: 'text-lg' },
  weight,
  lineHeight,
  className = '',
  truncate = false
}: AdaptiveTextProps) {
  const { getResponsiveValue } = useResponsive()

  const textSize = getResponsiveValue(size)
  const textWeight = weight ? getResponsiveValue(weight) : ''
  const textLineHeight = lineHeight ? getResponsiveValue(lineHeight) : ''
  const shouldTruncate = getResponsiveValue(truncate)

  const textClasses = [
    textSize,
    textWeight,
    textLineHeight,
    shouldTruncate && 'truncate',
    className
  ].filter(Boolean).join(' ')

  return (
    <div className={textClasses}>
      {children}
    </div>
  )
}

interface ResponsiveImageProps {
  src: string
  alt: string
  sizes?: Partial<Record<BreakpointKey, string>>
  aspectRatio?: number
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down'
  className?: string
  fallback?: string
  loading?: 'lazy' | 'eager'
}

export function ResponsiveImage({
  src,
  alt,
  sizes,
  aspectRatio,
  objectFit = 'cover',
  className = '',
  fallback = '/placeholder-media.jpg',
  loading = 'lazy'
}: ResponsiveImageProps) {
  const { getResponsiveValue } = useResponsive()

  const imageSize = sizes ? getResponsiveValue(sizes) : undefined

  const imageStyle: React.CSSProperties = {
    width: imageSize || '100%',
    height: 'auto',
    objectFit,
    ...(aspectRatio && {
      aspectRatio: aspectRatio.toString()
    })
  }

  return (
    <img
      src={src}
      alt={alt}
      style={imageStyle}
      className={`responsive-image ${className}`}
      loading={loading}
      onError={(e) => {
        const target = e.target as HTMLImageElement
        target.src = fallback
      }}
    />
  )
}

interface FluidSpacingProps {
  children: React.ReactNode
  minSpacing: number
  maxSpacing: number
  property?: 'padding' | 'margin' | 'paddingTop' | 'paddingBottom' | 'marginTop' | 'marginBottom'
  className?: string
}

export function FluidSpacing({
  children,
  minSpacing,
  maxSpacing,
  property = 'padding',
  className = ''
}: FluidSpacingProps) {
  const { viewport } = useResponsive()

  // Calculate fluid spacing based on viewport width
  const minViewport = 320
  const maxViewport = 1200
  const currentViewport = viewport.width
  
  let spacing = minSpacing
  if (currentViewport <= minViewport) {
    spacing = minSpacing
  } else if (currentViewport >= maxViewport) {
    spacing = maxSpacing
  } else {
    const ratio = (currentViewport - minViewport) / (maxViewport - minViewport)
    spacing = minSpacing + (maxSpacing - minSpacing) * ratio
  }

  const spacingStyle: React.CSSProperties = {
    [property]: `${spacing}px`
  }

  return (
    <div
      className={`fluid-spacing ${className}`}
      style={spacingStyle}
    >
      {children}
    </div>
  )
}