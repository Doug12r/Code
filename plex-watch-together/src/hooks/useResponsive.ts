import { useEffect, useState, useCallback } from 'react'

export type BreakpointKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
export type DeviceType = 'mobile' | 'tablet' | 'desktop'
export type Orientation = 'portrait' | 'landscape'

export interface Breakpoints {
  xs: number    // 0-640px (mobile portrait)
  sm: number    // 640-768px (mobile landscape/small tablet)
  md: number    // 768-1024px (tablet)
  lg: number    // 1024-1280px (desktop)
  xl: number    // 1280-1536px (large desktop)
  '2xl': number // 1536px+ (extra large desktop)
}

export interface ViewportInfo {
  width: number
  height: number
  breakpoint: BreakpointKey
  deviceType: DeviceType
  orientation: Orientation
  isTouch: boolean
  pixelRatio: number
  isRetina: boolean
  aspectRatio: number
}

export interface ResponsiveConfig {
  breakpoints: Breakpoints
  touchThreshold: number
  retinaThreshold: number
}

const defaultBreakpoints: Breakpoints = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536
}

const defaultConfig: ResponsiveConfig = {
  breakpoints: defaultBreakpoints,
  touchThreshold: 1024, // Consider touch-first below this width
  retinaThreshold: 1.5
}

export function useResponsive(config: Partial<ResponsiveConfig> = {}) {
  const [finalConfig] = useState(() => ({ ...defaultConfig, ...config }))
  const [viewport, setViewport] = useState<ViewportInfo>(() => getInitialViewport(finalConfig))

  const updateViewport = useCallback(() => {
    if (typeof window === 'undefined') return
    
    const width = window.innerWidth
    const height = window.innerHeight
    const pixelRatio = window.devicePixelRatio || 1
    const aspectRatio = width / height

    // Determine breakpoint
    let breakpoint: BreakpointKey = 'xs'
    const breakpoints = Object.entries(finalConfig.breakpoints)
      .sort(([, a], [, b]) => b - a) // Sort descending

    for (const [key, minWidth] of breakpoints) {
      if (width >= minWidth) {
        breakpoint = key as BreakpointKey
        break
      }
    }

    // Determine device type
    let deviceType: DeviceType = 'mobile'
    if (width >= finalConfig.breakpoints.md) {
      deviceType = width >= finalConfig.breakpoints.lg ? 'desktop' : 'tablet'
    }

    // Determine orientation
    const orientation: Orientation = width > height ? 'landscape' : 'portrait'

    // Detect touch capability
    const isTouch = 'ontouchstart' in window || 
                   navigator.maxTouchPoints > 0 || 
                   width < finalConfig.touchThreshold

    const newViewport: ViewportInfo = {
      width,
      height,
      breakpoint,
      deviceType,
      orientation,
      isTouch,
      pixelRatio,
      isRetina: pixelRatio >= finalConfig.retinaThreshold,
      aspectRatio
    }

    setViewport(prevViewport => {
      // Only update if viewport actually changed to prevent unnecessary re-renders
      if (
        prevViewport.width === newViewport.width &&
        prevViewport.height === newViewport.height &&
        prevViewport.breakpoint === newViewport.breakpoint &&
        prevViewport.deviceType === newViewport.deviceType &&
        prevViewport.orientation === newViewport.orientation &&
        prevViewport.isTouch === newViewport.isTouch &&
        prevViewport.pixelRatio === newViewport.pixelRatio &&
        prevViewport.isRetina === newViewport.isRetina
      ) {
        return prevViewport
      }
      return newViewport
    })
  }, [finalConfig])

  useEffect(() => {
    updateViewport()

    // Use ResizeObserver if available, otherwise fall back to resize event
    if ('ResizeObserver' in window) {
      const resizeObserver = new ResizeObserver(updateViewport)
      resizeObserver.observe(document.documentElement)

      return () => {
        resizeObserver.disconnect()
      }
    } else {
      const handleResize = updateViewport
      const handleOrientationChange = updateViewport
      
      globalThis.addEventListener('resize', handleResize)
      globalThis.addEventListener('orientationchange', handleOrientationChange)

      return () => {
        globalThis.removeEventListener('resize', handleResize)
        globalThis.removeEventListener('orientationchange', handleOrientationChange)
      }
    }
  }, [updateViewport])

  // Utility functions
  const isMobile = viewport.deviceType === 'mobile'
  const isTablet = viewport.deviceType === 'tablet'
  const isDesktop = viewport.deviceType === 'desktop'
  const isPortrait = viewport.orientation === 'portrait'
  const isLandscape = viewport.orientation === 'landscape'

  const isBreakpoint = (bp: BreakpointKey) => viewport.breakpoint === bp
  const isBreakpointUp = (bp: BreakpointKey) => {
    const currentIndex = Object.keys(finalConfig.breakpoints).indexOf(viewport.breakpoint)
    const targetIndex = Object.keys(finalConfig.breakpoints).indexOf(bp)
    return currentIndex >= targetIndex
  }
  const isBreakpointDown = (bp: BreakpointKey) => {
    const currentIndex = Object.keys(finalConfig.breakpoints).indexOf(viewport.breakpoint)
    const targetIndex = Object.keys(finalConfig.breakpoints).indexOf(bp)
    return currentIndex <= targetIndex
  }

  // Responsive value resolver
  const getResponsiveValue = <T>(values: Partial<Record<BreakpointKey, T>> | T): T => {
    if (typeof values !== 'object' || values === null || Array.isArray(values)) {
      return values as T
    }

    const responsiveValues = values as Partial<Record<BreakpointKey, T>>
    const breakpointOrder: BreakpointKey[] = ['2xl', 'xl', 'lg', 'md', 'sm', 'xs']
    const currentBpIndex = breakpointOrder.indexOf(viewport.breakpoint)

    // Find the most appropriate value by walking down from current breakpoint
    for (let i = currentBpIndex; i < breakpointOrder.length; i++) {
      const bp = breakpointOrder[i]
      if (bp in responsiveValues && responsiveValues[bp] !== undefined) {
        return responsiveValues[bp]!
      }
    }

    // If no value found, try walking up
    for (let i = currentBpIndex - 1; i >= 0; i--) {
      const bp = breakpointOrder[i]
      if (bp in responsiveValues && responsiveValues[bp] !== undefined) {
        return responsiveValues[bp]!
      }
    }

    // Fallback to any available value
    const availableValue = Object.values(responsiveValues).find(v => v !== undefined)
    return availableValue as T
  }

  return {
    viewport,
    isMobile,
    isTablet,
    isDesktop,
    isPortrait,
    isLandscape,
    isTouch: viewport.isTouch,
    isRetina: viewport.isRetina,
    isBreakpoint,
    isBreakpointUp,
    isBreakpointDown,
    getResponsiveValue,
    config: finalConfig
  }
}

function getInitialViewport(config: ResponsiveConfig): ViewportInfo {
  // Server-side fallback values
  if (typeof window === 'undefined') {
    return {
      width: 1024,
      height: 768,
      breakpoint: 'lg',
      deviceType: 'desktop',
      orientation: 'landscape',
      isTouch: false,
      pixelRatio: 1,
      isRetina: false,
      aspectRatio: 1024 / 768
    }
  }

  const width = window.innerWidth
  const height = window.innerHeight
  const pixelRatio = window.devicePixelRatio || 1

  let breakpoint: BreakpointKey = 'xs'
  const breakpoints = Object.entries(config.breakpoints)
    .sort(([, a], [, b]) => b - a)

  for (const [key, minWidth] of breakpoints) {
    if (width >= minWidth) {
      breakpoint = key as BreakpointKey
      break
    }
  }

  return {
    width,
    height,
    breakpoint,
    deviceType: width >= config.breakpoints.md ? 
                (width >= config.breakpoints.lg ? 'desktop' : 'tablet') : 'mobile',
    orientation: width > height ? 'landscape' : 'portrait',
    isTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    pixelRatio,
    isRetina: pixelRatio >= config.retinaThreshold,
    aspectRatio: width / height
  }
}

// Hook for responsive classes
export function useResponsiveClasses() {
  const { viewport, isBreakpointUp, isBreakpointDown } = useResponsive()

  const getResponsiveClasses = (classes: Partial<Record<BreakpointKey, string>>) => {
    const activeClasses: string[] = []
    
    // Add classes for current breakpoint and all smaller ones
    Object.entries(classes).forEach(([bp, className]) => {
      if (className && isBreakpointUp(bp as BreakpointKey)) {
        activeClasses.push(className)
      }
    })

    return activeClasses.join(' ')
  }

  const getDeviceClasses = () => {
    const classes = [
      `device-${viewport.deviceType}`,
      `orientation-${viewport.orientation}`,
      `breakpoint-${viewport.breakpoint}`
    ]

    if (viewport.isTouch) classes.push('touch-device')
    if (viewport.isRetina) classes.push('retina-display')

    return classes.join(' ')
  }

  return {
    viewport,
    getResponsiveClasses,
    getDeviceClasses
  }
}

// Hook for responsive media queries
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia(query)
    setMatches(mediaQuery.matches)

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    } else {
      // Legacy browsers
      mediaQuery.addListener(handler)
      return () => mediaQuery.removeListener(handler)
    }
  }, [query])

  return matches
}

// Hook for container queries (when supported)
export function useContainerQuery(element: HTMLElement | null, query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (!element || typeof window === 'undefined') return

    // Check if container queries are supported
    if ('CSS' in window && 'supports' in CSS && CSS.supports('container-type: inline-size')) {
      // Use ResizeObserver as fallback for container query behavior
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (entry) {
          const width = entry.contentRect.width
          // Simple width-based container query simulation
          const match = query.includes('min-width')
          const value = parseInt(query.match(/\d+/)?.[0] || '0')
          setMatches(match ? width >= value : width <= value)
        }
      })

      observer.observe(element)
      return () => observer.disconnect()
    }
  }, [element, query])

  return matches
}

// Utility functions for responsive calculations
export const ResponsiveUtils = {
  // Convert viewport units to pixels
  vwToPx: (vw: number) => (window.innerWidth * vw) / 100,
  vhToPx: (vh: number) => (window.innerHeight * vh) / 100,
  
  // Calculate responsive font size
  getFluidFontSize: (minSize: number, maxSize: number, minViewport = 320, maxViewport = 1200) => {
    const currentViewport = window.innerWidth
    if (currentViewport <= minViewport) return minSize
    if (currentViewport >= maxViewport) return maxSize
    
    const slope = (maxSize - minSize) / (maxViewport - minViewport)
    return minSize + slope * (currentViewport - minViewport)
  },

  // Calculate responsive spacing
  getFluidSpacing: (minSpacing: number, maxSpacing: number, minViewport = 320, maxViewport = 1200) => {
    return ResponsiveUtils.getFluidFontSize(minSpacing, maxSpacing, minViewport, maxViewport)
  },

  // Get touch-friendly sizes
  getTouchSize: (baseSize: number, isTouch: boolean) => {
    return isTouch ? Math.max(baseSize, 44) : baseSize // 44px minimum for touch targets
  },

  // Calculate grid columns based on viewport
  getResponsiveColumns: (viewport: ViewportInfo) => {
    switch (viewport.deviceType) {
      case 'mobile': return viewport.orientation === 'portrait' ? 1 : 2
      case 'tablet': return viewport.orientation === 'portrait' ? 2 : 3
      case 'desktop': return viewport.width < 1400 ? 4 : 6
      default: return 1
    }
  }
}