import { useEffect, useRef, useState } from 'react'

// ARIA live region utilities
export function useAriaLiveRegion() {
  const regionRef = useRef<HTMLDivElement | null>(null)

  const announce = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (regionRef.current) {
      regionRef.current.setAttribute('aria-live', priority)
      regionRef.current.textContent = message
      
      // Clear after announcement
      setTimeout(() => {
        if (regionRef.current) {
          regionRef.current.textContent = ''
        }
      }, 1000)
    }
  }

  return { announce, regionRef }
}

// Keyboard navigation utilities
export function useKeyboardNavigation(containerRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const focusableElements = container.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) as NodeListOf<HTMLElement>

      const focusableArray = Array.from(focusableElements)
      const currentIndex = focusableArray.indexOf(document.activeElement as HTMLElement)

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault()
          const nextIndex = (currentIndex + 1) % focusableArray.length
          focusableArray[nextIndex]?.focus()
          break
          
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault()
          const prevIndex = (currentIndex - 1 + focusableArray.length) % focusableArray.length
          focusableArray[prevIndex]?.focus()
          break
          
        case 'Home':
          e.preventDefault()
          focusableArray[0]?.focus()
          break
          
        case 'End':
          e.preventDefault()
          focusableArray[focusableArray.length - 1]?.focus()
          break
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [containerRef])
}

// Focus management utilities
export function useFocusManagement() {
  const [focusedElement, setFocusedElement] = useState<HTMLElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const saveFocus = () => {
    previousFocusRef.current = document.activeElement as HTMLElement
  }

  const restoreFocus = () => {
    if (previousFocusRef.current) {
      previousFocusRef.current.focus()
      previousFocusRef.current = null
    }
  }

  const focusElement = (element: HTMLElement | null) => {
    if (element) {
      element.focus()
      setFocusedElement(element)
    }
  }

  const focusFirstElement = (container: HTMLElement) => {
    const firstFocusable = container.querySelector(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) as HTMLElement
    
    if (firstFocusable) {
      firstFocusable.focus()
    }
  }

  return {
    focusedElement,
    saveFocus,
    restoreFocus,
    focusElement,
    focusFirstElement
  }
}

// Color contrast utilities
export function checkColorContrast(foreground: string, background: string): {
  ratio: number
  AA: boolean
  AAA: boolean
} {
  // Convert hex to RGB
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null
  }

  // Calculate relative luminance
  const getLuminance = (rgb: { r: number; g: number; b: number }) => {
    const { r, g, b } = rgb
    const [rs, gs, bs] = [r, g, b].map(c => {
      c = c / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
  }

  const fg = hexToRgb(foreground)
  const bg = hexToRgb(background)

  if (!fg || !bg) {
    return { ratio: 0, AA: false, AAA: false }
  }

  const fgLuminance = getLuminance(fg)
  const bgLuminance = getLuminance(bg)

  const ratio = (Math.max(fgLuminance, bgLuminance) + 0.05) / 
                (Math.min(fgLuminance, bgLuminance) + 0.05)

  return {
    ratio: Math.round(ratio * 100) / 100,
    AA: ratio >= 4.5,
    AAA: ratio >= 7
  }
}

// Screen reader utilities
export function useScreenReaderSupport() {
  const [isScreenReader, setIsScreenReader] = useState(false)

  useEffect(() => {
    // Detect common screen readers
    const userAgent = navigator.userAgent.toLowerCase()
    const hasScreenReader = 
      userAgent.includes('nvda') ||
      userAgent.includes('jaws') ||
      userAgent.includes('voiceover') ||
      'speechSynthesis' in window

    setIsScreenReader(hasScreenReader)

    // Also check for reduced motion preference as an indicator
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setIsScreenReader(true)
    }
  }, [])

  return { isScreenReader }
}

// Reduced motion utilities
export function useReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)

    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return prefersReducedMotion
}

// High contrast utilities
export function useHighContrast() {
  const [prefersHighContrast, setPrefersHighContrast] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-contrast: high)')
    setPrefersHighContrast(mediaQuery.matches)

    const handleChange = () => setPrefersHighContrast(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)

    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return prefersHighContrast
}

// Text size utilities
export function useTextScale() {
  const [textScale, setTextScale] = useState(1)

  const scaleText = (scale: number) => {
    setTextScale(Math.max(0.5, Math.min(2, scale)))
    document.documentElement.style.fontSize = `${16 * scale}px`
  }

  const resetTextScale = () => {
    setTextScale(1)
    document.documentElement.style.fontSize = '16px'
  }

  return {
    textScale,
    scaleText,
    resetTextScale
  }
}

// ARIA utilities
export function generateAriaId(prefix = 'aria'): string {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`
}

export function createAriaDescribedBy(...ids: (string | undefined)[]): string | undefined {
  const validIds = ids.filter(Boolean)
  return validIds.length > 0 ? validIds.join(' ') : undefined
}

// Keyboard trap utilities
export function createKeyboardTrap(container: HTMLElement) {
  const focusableElements = container.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ) as NodeListOf<HTMLElement>

  const firstElement = focusableElements[0]
  const lastElement = focusableElements[focusableElements.length - 1]

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    if (e.key === 'Escape') {
      const event = new CustomEvent('escape-key')
      container.dispatchEvent(event)
    }
  }

  container.addEventListener('keydown', handleKeyDown)
  
  // Focus first element
  firstElement?.focus()

  return () => {
    container.removeEventListener('keydown', handleKeyDown)
  }
}

// Accessibility validator utilities
export interface AccessibilityViolation {
  element: HTMLElement
  type: 'missing-alt' | 'missing-label' | 'low-contrast' | 'missing-heading' | 'invalid-structure'
  message: string
  severity: 'error' | 'warning' | 'info'
}

export function validateAccessibility(container: HTMLElement = document.body): AccessibilityViolation[] {
  const violations: AccessibilityViolation[] = []

  // Check for images without alt text
  const images = container.querySelectorAll('img:not([alt])')
  images.forEach(img => {
    violations.push({
      element: img as HTMLElement,
      type: 'missing-alt',
      message: 'Image is missing alt text',
      severity: 'error'
    })
  })

  // Check for form inputs without labels
  const inputs = container.querySelectorAll('input:not([type="hidden"]):not([aria-label]):not([aria-labelledby])')
  inputs.forEach(input => {
    const hasLabel = container.querySelector(`label[for="${input.id}"]`)
    if (!hasLabel && input.id) {
      violations.push({
        element: input as HTMLElement,
        type: 'missing-label',
        message: 'Form input is missing a label',
        severity: 'error'
      })
    }
  })

  // Check heading structure
  const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
  let previousLevel = 0
  headings.forEach(heading => {
    const currentLevel = parseInt(heading.tagName.charAt(1))
    if (currentLevel - previousLevel > 1) {
      violations.push({
        element: heading as HTMLElement,
        type: 'invalid-structure',
        message: `Heading level skipped from h${previousLevel} to h${currentLevel}`,
        severity: 'warning'
      })
    }
    previousLevel = currentLevel
  })

  return violations
}

// CSS utilities for accessibility
export const accessibilityStyles = `
  /* Screen reader only content */
  .sr-only {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    margin: -1px !important;
    overflow: hidden !important;
    clip: rect(0, 0, 0, 0) !important;
    white-space: nowrap !important;
    border: 0 !important;
  }
  
  .sr-only:focus {
    position: static !important;
    width: auto !important;
    height: auto !important;
    padding: inherit !important;
    margin: inherit !important;
    overflow: visible !important;
    clip: auto !important;
    white-space: normal !important;
  }

  /* Focus indicators */
  .focus-visible:focus {
    outline: 2px solid #3b82f6 !important;
    outline-offset: 2px !important;
  }

  /* High contrast mode */
  .high-contrast {
    filter: contrast(1.5);
  }

  .high-contrast * {
    border-color: #000 !important;
  }

  /* Reduced motion */
  .motion-reduce,
  .motion-reduce *,
  .motion-reduce *:before,
  .motion-reduce *:after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  /* Large text */
  .large-text {
    font-size: 1.25em !important;
    line-height: 1.5 !important;
  }
`