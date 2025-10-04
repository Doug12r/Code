import React from 'react'
import { useResponsive } from '@/hooks/useResponsive'
import { cn } from '@/lib/utils'

interface MobileLayoutProps {
  children: React.ReactNode
  header?: React.ReactNode
  footer?: React.ReactNode
  navigation?: React.ReactNode
  className?: string
  safeArea?: boolean
  fullHeight?: boolean
}

export function MobileLayout({
  children,
  header,
  footer,
  navigation,
  className = '',
  safeArea = true,
  fullHeight = true
}: MobileLayoutProps) {
  const { isMobile } = useResponsive()

  if (!isMobile) {
    return (
      <div className={className}>
        {header}
        {children}
        {footer}
      </div>
    )
  }

  return (
    <div className={cn(
      'mobile-layout flex flex-col',
      {
        'h-screen': fullHeight,
        'min-h-screen': !fullHeight,
        'safe-area-inset': safeArea
      },
      className
    )}>
      {/* Header */}
      {header && (
        <div className="mobile-header flex-shrink-0 safe-area-pt">
          {header}
        </div>
      )}

      {/* Main Content */}
      <div className="mobile-content flex-1 overflow-auto">
        {children}
      </div>

      {/* Navigation */}
      {navigation && (
        <div className="mobile-navigation flex-shrink-0">
          {navigation}
        </div>
      )}

      {/* Footer */}
      {footer && (
        <div className="mobile-footer flex-shrink-0 safe-area-pb">
          {footer}
        </div>
      )}
    </div>
  )
}

interface CardLayoutProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
  actions?: React.ReactNode
  padding?: 'none' | 'small' | 'medium' | 'large'
  className?: string
  compact?: boolean
}

export function CardLayout({
  children,
  title,
  subtitle,
  actions,
  padding = 'medium',
  className = '',
  compact = false
}: CardLayoutProps) {
  const { isMobile } = useResponsive()

  const paddingClasses = {
    none: 'p-0',
    small: isMobile ? 'p-3' : 'p-4',
    medium: isMobile ? 'p-4' : 'p-6',
    large: isMobile ? 'p-6' : 'p-8'
  }

  return (
    <div className={cn(
      'card-layout bg-white rounded-lg shadow-sm border',
      {
        'shadow-lg': !compact,
        'shadow-sm': compact
      },
      className
    )}>
      {/* Card Header */}
      {(title || subtitle || actions) && (
        <div className={cn(
          'card-header flex items-center justify-between border-b',
          paddingClasses[padding],
          'pb-3'
        )}>
          <div className="flex-1 min-w-0">
            {title && (
              <h3 className={cn(
                'font-semibold text-gray-900 truncate',
                isMobile ? 'text-lg' : 'text-xl'
              )}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-sm text-gray-600 mt-1 truncate">
                {subtitle}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex-shrink-0 ml-4">
              {actions}
            </div>
          )}
        </div>
      )}

      {/* Card Content */}
      <div className={cn(
        'card-content',
        paddingClasses[padding],
        (title || subtitle || actions) && 'pt-4'
      )}>
        {children}
      </div>
    </div>
  )
}

interface ListLayoutProps {
  items: Array<{
    id: string | number
    content: React.ReactNode
    action?: React.ReactNode
    subtitle?: string
    meta?: string
    avatar?: React.ReactNode
  }>
  onItemClick?: (id: string | number) => void
  variant?: 'default' | 'condensed' | 'card'
  dividers?: boolean
  className?: string
}

export function ListLayout({
  items,
  onItemClick,
  variant = 'default',
  dividers = true,
  className = ''
}: ListLayoutProps) {
  const { isMobile } = useResponsive()

  const itemClasses = cn(
    'list-item transition-colors duration-150',
    {
      'p-4': variant === 'default' && !isMobile,
      'p-3': variant === 'default' && isMobile,
      'p-2': variant === 'condensed',
      'p-4 m-2 bg-white rounded-lg shadow-sm border': variant === 'card',
      'hover:bg-gray-50': variant !== 'card',
      'hover:shadow-md': variant === 'card',
      'cursor-pointer': onItemClick,
      'border-b border-gray-200': dividers && variant !== 'card'
    }
  )

  return (
    <div className={cn('list-layout', className)}>
      {items.map((item, index) => (
        <div
          key={item.id}
          className={cn(
            itemClasses,
            index === items.length - 1 && dividers && 'border-b-0'
          )}
          onClick={() => onItemClick?.(item.id)}
        >
          <div className="flex items-center space-x-3">
            {/* Avatar */}
            {item.avatar && (
              <div className="flex-shrink-0">
                {item.avatar}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  {item.content}
                  {item.subtitle && (
                    <p className="text-sm text-gray-600 mt-1 truncate">
                      {item.subtitle}
                    </p>
                  )}
                </div>
                {item.meta && (
                  <div className="flex-shrink-0 ml-2 text-sm text-gray-500">
                    {item.meta}
                  </div>
                )}
              </div>
            </div>

            {/* Action */}
            {item.action && (
              <div className="flex-shrink-0">
                {item.action}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

interface GridLayoutProps {
  children: React.ReactNode
  cols?: {
    xs?: number
    sm?: number
    md?: number
    lg?: number
    xl?: number
  }
  gap?: number
  className?: string
}

export function GridLayout({
  children,
  cols = { xs: 1, sm: 2, md: 3, lg: 4 },
  gap = 4,
  className = ''
}: GridLayoutProps) {
  const gridClasses = cn(
    'grid-layout grid',
    {
      [`grid-cols-${cols.xs || 1}`]: cols.xs,
      [`sm:grid-cols-${cols.sm || cols.xs || 1}`]: cols.sm,
      [`md:grid-cols-${cols.md || cols.sm || cols.xs || 1}`]: cols.md,
      [`lg:grid-cols-${cols.lg || cols.md || cols.sm || cols.xs || 1}`]: cols.lg,
      [`xl:grid-cols-${cols.xl || cols.lg || cols.md || cols.sm || cols.xs || 1}`]: cols.xl,
      [`gap-${gap}`]: gap
    },
    className
  )

  return (
    <div className={gridClasses}>
      {children}
    </div>
  )
}

interface SplitLayoutProps {
  left: React.ReactNode
  right: React.ReactNode
  leftWidth?: string
  rightWidth?: string
  gap?: number
  stackOnMobile?: boolean
  className?: string
}

export function SplitLayout({
  left,
  right,
  leftWidth = 'auto',
  rightWidth = 'auto',
  gap = 6,
  stackOnMobile = true,
  className = ''
}: SplitLayoutProps) {
  const { isMobile } = useResponsive()

  if (isMobile && stackOnMobile) {
    return (
      <div className={cn('split-layout-mobile flex flex-col', `gap-${gap}`, className)}>
        <div className="split-left">{left}</div>
        <div className="split-right">{right}</div>
      </div>
    )
  }

  return (
    <div className={cn('split-layout flex', `gap-${gap}`, className)}>
      <div 
        className="split-left flex-shrink-0"
        style={{ width: leftWidth === 'auto' ? undefined : leftWidth }}
      >
        {left}
      </div>
      <div 
        className="split-right flex-1"
        style={{ width: rightWidth === 'auto' ? undefined : rightWidth }}
      >
        {right}
      </div>
    </div>
  )
}

interface CenteredLayoutProps {
  children: React.ReactNode
  maxWidth?: string
  padding?: boolean
  className?: string
}

export function CenteredLayout({
  children,
  maxWidth = '2xl',
  padding = true,
  className = ''
}: CenteredLayoutProps) {
  return (
    <div className={cn(
      'centered-layout mx-auto',
      {
        'px-4 sm:px-6 lg:px-8': padding,
        [`max-w-${maxWidth}`]: maxWidth
      },
      className
    )}>
      {children}
    </div>
  )
}

interface SidebarLayoutProps {
  sidebar: React.ReactNode
  children: React.ReactNode
  sidebarWidth?: string
  collapsible?: boolean
  defaultCollapsed?: boolean
  position?: 'left' | 'right'
  overlay?: boolean
  className?: string
}

export function SidebarLayout({
  sidebar,
  children,
  sidebarWidth = '64',
  collapsible = true,
  defaultCollapsed = false,
  position = 'left',
  overlay = false,
  className = ''
}: SidebarLayoutProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed)
  const { isMobile } = useResponsive()

  // On mobile, always use overlay
  const useOverlay = isMobile || overlay

  return (
    <div className={cn('sidebar-layout flex h-full relative', className)}>
      {/* Backdrop for mobile overlay */}
      {useOverlay && !isCollapsed && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsCollapsed(true)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        'sidebar transition-all duration-300 bg-white border-r flex-shrink-0',
        {
          // Desktop styles
          [`w-${sidebarWidth}`]: !isMobile && !isCollapsed,
          'w-0 overflow-hidden': !isMobile && isCollapsed,
          // Mobile styles
          'fixed inset-y-0 z-50 w-64 transform': useOverlay,
          '-translate-x-full': useOverlay && isCollapsed,
          'translate-x-0': useOverlay && !isCollapsed,
          'left-0': position === 'left',
          'right-0': position === 'right'
        }
      )}>
        {sidebar}
      </div>

      {/* Main Content */}
      <div className="main-content flex-1 min-w-0">
        {/* Toggle Button for Collapsible Sidebar */}
        {collapsible && (
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="sidebar-toggle p-2 m-2 rounded-md hover:bg-gray-100 transition-colors"
            aria-label={isCollapsed ? 'Open sidebar' : 'Close sidebar'}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        )}
        
        <div className="content-wrapper">
          {children}
        </div>
      </div>
    </div>
  )
}