import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface AccessibilityContextType {
  focusVisible: boolean
  reducedMotion: boolean
  highContrast: boolean
  largeText: boolean
  screenReader: boolean
  keyboardNavigation: boolean
  setFocusVisible: (visible: boolean) => void
  setReducedMotion: (reduced: boolean) => void
  setHighContrast: (contrast: boolean) => void
  setLargeText: (large: boolean) => void
  announceToScreenReader: (message: string, priority?: 'polite' | 'assertive') => void
}

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined)

export function useAccessibility() {
  const context = useContext(AccessibilityContext)
  if (!context) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider')
  }
  return context
}

interface AccessibilityProviderProps {
  children: React.ReactNode
}

export function AccessibilityProvider({ children }: AccessibilityProviderProps) {
  const [focusVisible, setFocusVisible] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [highContrast, setHighContrast] = useState(false)
  const [largeText, setLargeText] = useState(false)
  const [screenReader, setScreenReader] = useState(false)
  const [keyboardNavigation, setKeyboardNavigation] = useState(false)
  
  const announcementRef = useRef<HTMLDivElement>(null)

  // Detect user preferences on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Check for prefers-reduced-motion
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      setReducedMotion(prefersReducedMotion)

      // Check for prefers-contrast
      const prefersHighContrast = window.matchMedia('(prefers-contrast: high)').matches
      setHighContrast(prefersHighContrast)

      // Check for screen reader
      const hasScreenReader = window.navigator.userAgent.includes('NVDA') || 
                             window.navigator.userAgent.includes('JAWS') ||
                             'speechSynthesis' in window
      setScreenReader(hasScreenReader)

      // Listen for keyboard navigation
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Tab') {
          setKeyboardNavigation(true)
          setFocusVisible(true)
        }
      }

      const handleMouseDown = () => {
        setFocusVisible(false)
      }

      document.addEventListener('keydown', handleKeyDown)
      document.addEventListener('mousedown', handleMouseDown)

      return () => {
        document.removeEventListener('keydown', handleKeyDown)
        document.removeEventListener('mousedown', handleMouseDown)
      }
    }
  }, [])

  const announceToScreenReader = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (announcementRef.current) {
      announcementRef.current.textContent = message
      announcementRef.current.setAttribute('aria-live', priority)
      
      // Clear after a short delay
      setTimeout(() => {
        if (announcementRef.current) {
          announcementRef.current.textContent = ''
        }
      }, 1000)
    }
  }, [])

  const value = {
    focusVisible,
    reducedMotion,
    highContrast,
    largeText,
    screenReader,
    keyboardNavigation,
    setFocusVisible,
    setReducedMotion,
    setHighContrast,
    setLargeText,
    announceToScreenReader
  }

  return (
    <AccessibilityContext.Provider value={value}>
      <div className={cn(
        'accessibility-root',
        {
          'motion-reduce': reducedMotion,
          'high-contrast': highContrast,
          'large-text': largeText,
          'focus-visible': focusVisible
        }
      )}>
        {children}
        
        {/* Screen reader announcements */}
        <div
          ref={announcementRef}
          className="sr-only"
          aria-live="polite"
          aria-atomic="true"
        />
      </div>
    </AccessibilityContext.Provider>
  )
}

interface AccessibleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  loadingText?: string
  ariaLabel?: string
}

export function AccessibleButton({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingText = 'Loading...',
  ariaLabel,
  className = '',
  disabled,
  ...props
}: AccessibleButtonProps) {
  const { focusVisible, reducedMotion } = useAccessibility()

  const baseClasses = cn(
    'accessible-button relative inline-flex items-center justify-center font-medium transition-colors',
    'focus:outline-none focus:ring-2 focus:ring-offset-2',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    {
      // Focus styles
      'focus:ring-blue-500': focusVisible,
      
      // Size variants
      'px-3 py-1.5 text-sm rounded': size === 'sm',
      'px-4 py-2 text-base rounded-md': size === 'md',
      'px-6 py-3 text-lg rounded-lg': size === 'lg',
      
      // Color variants
      'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500': variant === 'primary',
      'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500': variant === 'secondary',
      'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-blue-500': variant === 'outline',
      'text-gray-700 hover:bg-gray-100 focus:ring-blue-500': variant === 'ghost',
      'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500': variant === 'danger',
      
      // Animation control
      'transition-none': reducedMotion
    },
    className
  )

  return (
    <button
      className={baseClasses}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-busy={loading}
      {...props}
    >
      {loading ? (
        <>
          <svg
            className={cn(
              'animate-spin -ml-1 mr-2',
              size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'
            )}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="sr-only">{loadingText}</span>
        </>
      ) : null}
      <span className={loading ? 'opacity-0' : ''}>{children}</span>
    </button>
  )
}

interface AccessibleInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  helperText?: string
  required?: boolean
}

export function AccessibleInput({
  label,
  error,
  helperText,
  required,
  className = '',
  id,
  ...props
}: AccessibleInputProps) {
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`
  const errorId = error ? `${inputId}-error` : undefined
  const helperId = helperText ? `${inputId}-helper` : undefined
  const { focusVisible } = useAccessibility()

  return (
    <div className="accessible-input-group">
      <label
        htmlFor={inputId}
        className={cn(
          'block text-sm font-medium mb-1',
          error ? 'text-red-700' : 'text-gray-700'
        )}
      >
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-label="required">
            *
          </span>
        )}
      </label>
      
      <input
        id={inputId}
        className={cn(
          'block w-full px-3 py-2 border rounded-md shadow-sm transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-offset-0',
          {
            'border-red-300 focus:border-red-500 focus:ring-red-500': error,
            'border-gray-300 focus:border-blue-500 focus:ring-blue-500': !error,
            'focus:ring-2': focusVisible
          },
          className
        )}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={cn(
          errorId && errorId,
          helperId && helperId
        )}
        aria-required={required}
        {...props}
      />
      
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      
      {helperText && !error && (
        <p id={helperId} className="mt-1 text-sm text-gray-500">
          {helperText}
        </p>
      )}
    </div>
  )
}

interface SkipLinkProps {
  href: string
  children: React.ReactNode
}

export function SkipLink({ href, children }: SkipLinkProps) {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 bg-blue-600 text-white px-4 py-2 rounded-md font-medium transition-all"
    >
      {children}
    </a>
  )
}

interface AccessibleHeadingProps {
  level: 1 | 2 | 3 | 4 | 5 | 6
  children: React.ReactNode
  className?: string
  id?: string
}

export function AccessibleHeading({ level, children, className = '', id }: AccessibleHeadingProps) {
  const sizeClasses = {
    1: 'text-3xl font-bold',
    2: 'text-2xl font-bold',
    3: 'text-xl font-semibold',
    4: 'text-lg font-semibold',
    5: 'text-base font-medium',
    6: 'text-sm font-medium'
  }

  const headingClass = cn('accessible-heading', sizeClasses[level], className)
  const props = { id, className: headingClass, tabIndex: -1 }

  switch (level) {
    case 1:
      return <h1 {...props}>{children}</h1>
    case 2:
      return <h2 {...props}>{children}</h2>
    case 3:
      return <h3 {...props}>{children}</h3>
    case 4:
      return <h4 {...props}>{children}</h4>
    case 5:
      return <h5 {...props}>{children}</h5>
    case 6:
      return <h6 {...props}>{children}</h6>
    default:
      return <h1 {...props}>{children}</h1>
  }
}

interface FocusTrapProps {
  children: React.ReactNode
  active?: boolean
  restoreOnUnmount?: boolean
}

export function FocusTrap({ children, active = true, restoreOnUnmount = true }: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return

    const container = containerRef.current
    if (!container) return

    // Store the previously focused element
    previousActiveElementRef.current = document.activeElement as HTMLElement

    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>

    const firstFocusableElement = focusableElements[0]
    const lastFocusableElement = focusableElements[focusableElements.length - 1]

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        if (document.activeElement === firstFocusableElement) {
          e.preventDefault()
          lastFocusableElement?.focus()
        }
      } else {
        if (document.activeElement === lastFocusableElement) {
          e.preventDefault()
          firstFocusableElement?.focus()
        }
      }
    }

    // Focus the first element
    firstFocusableElement?.focus()

    document.addEventListener('keydown', handleTabKey)

    return () => {
      document.removeEventListener('keydown', handleTabKey)
      
      if (restoreOnUnmount && previousActiveElementRef.current) {
        previousActiveElementRef.current.focus()
      }
    }
  }, [active, restoreOnUnmount])

  return (
    <div ref={containerRef} className="focus-trap">
      {children}
    </div>
  )
}

interface KeyboardShortcutProps {
  keys: string[]
  onTrigger: () => void
  description: string
  disabled?: boolean
}

export function useKeyboardShortcut({ keys, onTrigger, description, disabled }: KeyboardShortcutProps) {
  useEffect(() => {
    if (disabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const pressedKeys: string[] = []
      
      if (e.ctrlKey) pressedKeys.push('Ctrl')
      if (e.metaKey) pressedKeys.push('Cmd')
      if (e.altKey) pressedKeys.push('Alt')
      if (e.shiftKey) pressedKeys.push('Shift')
      
      pressedKeys.push(e.key.toLowerCase())
      
      const normalizedKeys = keys.map(key => key.toLowerCase())
      
      if (normalizedKeys.every(key => pressedKeys.includes(key))) {
        e.preventDefault()
        onTrigger()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [keys, onTrigger, disabled])
}

interface AccessibilitySettingsProps {
  className?: string
}

export function AccessibilitySettings({ className = '' }: AccessibilitySettingsProps) {
  const {
    reducedMotion,
    highContrast,
    largeText,
    setReducedMotion,
    setHighContrast,
    setLargeText
  } = useAccessibility()

  return (
    <div className={cn('accessibility-settings space-y-4', className)}>
      <AccessibleHeading level={2}>Accessibility Settings</AccessibleHeading>
      
      <div className="space-y-3">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(e) => setReducedMotion(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm">
            Reduce motion and animations
          </span>
        </label>
        
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={highContrast}
            onChange={(e) => setHighContrast(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm">
            High contrast mode
          </span>
        </label>
        
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={largeText}
            onChange={(e) => setLargeText(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm">
            Large text size
          </span>
        </label>
      </div>
    </div>
  )
}