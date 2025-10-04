import React, { useState, useRef, useEffect } from 'react'
import { useResponsive } from '@/hooks/useResponsive'
import { cn } from '@/lib/utils'
import { X, Menu, ChevronDown, ChevronUp } from 'lucide-react'

interface ResponsiveNavProps {
  children: React.ReactNode
  logo?: React.ReactNode
  className?: string
  variant?: 'default' | 'floating' | 'sticky'
}

export function ResponsiveNav({ 
  children, 
  logo, 
  className = '',
  variant = 'default'
}: ResponsiveNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { isMobile, isTablet } = useResponsive()
  const isMobileOrTablet = isMobile || isTablet

  const baseClasses = cn(
    'responsive-nav w-full transition-all duration-300',
    {
      'fixed top-0 left-0 z-50 bg-white/95 backdrop-blur-md shadow-lg': variant === 'floating',
      'sticky top-0 z-40 bg-white border-b': variant === 'sticky',
      'relative bg-white': variant === 'default'
    },
    className
  )

  return (
    <nav className={baseClasses}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          {logo && (
            <div className="flex-shrink-0">
              {logo}
            </div>
          )}

          {/* Desktop Navigation */}
          {!isMobileOrTablet && (
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                {children}
              </div>
            </div>
          )}

          {/* Mobile menu button */}
          {isMobileOrTablet && (
            <div className="md:hidden">
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                aria-expanded="false"
              >
                <span className="sr-only">Open main menu</span>
                {isOpen ? (
                  <X className="block h-6 w-6" aria-hidden="true" />
                ) : (
                  <Menu className="block h-6 w-6" aria-hidden="true" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Mobile Navigation Menu */}
        {isMobileOrTablet && (
          <div className={cn(
            'md:hidden overflow-hidden transition-all duration-300 ease-in-out',
            isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          )}>
            <div className="px-2 pt-2 pb-3 space-y-1 bg-white border-t">
              {children}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}

interface NavItemProps {
  href?: string
  onClick?: () => void
  children: React.ReactNode
  active?: boolean
  disabled?: boolean
  className?: string
}

export function NavItem({ 
  href, 
  onClick, 
  children, 
  active = false, 
  disabled = false,
  className = '' 
}: NavItemProps) {
  const { isMobile, isTablet } = useResponsive()
  const isMobileOrTablet = isMobile || isTablet

  const baseClasses = cn(
    'transition-colors duration-200',
    {
      // Mobile styles
      'block px-3 py-2 rounded-md text-base font-medium w-full text-left': isMobileOrTablet,
      // Desktop styles
      'inline-flex items-center px-3 py-2 rounded-md text-sm font-medium': !isMobileOrTablet,
      // Active states
      'bg-blue-100 text-blue-700': active && !disabled,
      'text-gray-900 hover:bg-gray-100': !active && !disabled,
      // Disabled state
      'text-gray-400 cursor-not-allowed': disabled,
      'hover:bg-gray-50 hover:text-gray-700': !disabled
    },
    className
  )

  const Component = href ? 'a' : 'button'
  
  return (
    <Component
      href={href}
      onClick={disabled ? undefined : onClick}
      className={baseClasses}
      disabled={disabled}
    >
      {children}
    </Component>
  )
}

interface DropdownNavProps {
  trigger: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function DropdownNav({ trigger, children, className = '' }: DropdownNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { isMobile, isTablet } = useResponsive()
  const isMobileOrTablet = isMobile || isTablet

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={dropdownRef} className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1 transition-colors duration-200',
          {
            'block px-3 py-2 rounded-md text-base font-medium w-full text-left': isMobileOrTablet,
            'inline-flex items-center px-3 py-2 rounded-md text-sm font-medium': !isMobileOrTablet,
            'bg-gray-100 text-gray-900': isOpen,
            'text-gray-700 hover:text-gray-900 hover:bg-gray-100': !isOpen
          }
        )}
      >
        {trigger}
        {isOpen ? (
          <ChevronUp className="ml-1 h-4 w-4" />
        ) : (
          <ChevronDown className="ml-1 h-4 w-4" />
        )}
      </button>

      {isOpen && (
        <div className={cn(
          'absolute z-10 bg-white border border-gray-200 rounded-md shadow-lg',
          {
            // Mobile: Full width dropdown
            'left-0 right-0 mt-1': isMobileOrTablet,
            // Desktop: Positioned dropdown
            'left-0 mt-1 w-48': !isMobileOrTablet
          }
        )}>
          <div className="py-1">
            {children}
          </div>
        </div>
      )}
    </div>
  )
}

interface TabNavigationProps {
  tabs: Array<{
    id: string
    label: string
    content: React.ReactNode
    disabled?: boolean
  }>
  defaultTab?: string
  onChange?: (tabId: string) => void
  variant?: 'default' | 'pills' | 'underline'
  className?: string
}

export function TabNavigation({
  tabs,
  defaultTab,
  onChange,
  variant = 'default',
  className = ''
}: TabNavigationProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || '')
  const { isMobile } = useResponsive()

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
    onChange?.(tabId)
  }

  const activeTabContent = tabs.find(tab => tab.id === activeTab)?.content

  return (
    <div className={cn('tab-navigation', className)}>
      {/* Tab List */}
      <div className={cn(
        'flex',
        {
          'overflow-x-auto scrollbar-hide': isMobile,
          'flex-wrap': !isMobile,
          'border-b border-gray-200': variant === 'default' || variant === 'underline',
          'bg-gray-100 p-1 rounded-lg': variant === 'pills'
        }
      )}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && handleTabChange(tab.id)}
            className={cn(
              'flex-shrink-0 px-4 py-2 text-sm font-medium transition-colors duration-200',
              {
                // Default and underline variants
                'border-b-2 -mb-px': variant === 'default' || variant === 'underline',
                'border-blue-600 text-blue-600': variant === 'default' && activeTab === tab.id,
                'border-blue-500 text-blue-600': variant === 'underline' && activeTab === tab.id,
                'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300': 
                  (variant === 'default' || variant === 'underline') && activeTab !== tab.id && !tab.disabled,
                
                // Pills variant
                'rounded-md': variant === 'pills',
                'bg-white shadow-sm text-gray-900': variant === 'pills' && activeTab === tab.id,
                'text-gray-600 hover:text-gray-900': variant === 'pills' && activeTab !== tab.id && !tab.disabled,
                
                // Disabled state
                'text-gray-400 cursor-not-allowed': tab.disabled,
                'cursor-pointer': !tab.disabled,
                
                // Mobile specific
                'min-w-0 whitespace-nowrap': isMobile
              }
            )}
            disabled={tab.disabled}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="tab-content mt-4">
        {activeTabContent}
      </div>
    </div>
  )
}

interface BreadcrumbProps {
  items: Array<{
    label: string
    href?: string
    onClick?: () => void
  }>
  separator?: React.ReactNode
  maxItems?: number
  className?: string
}

export function Breadcrumb({
  items,
  separator = '/',
  maxItems = 3,
  className = ''
}: BreadcrumbProps) {
  const { isMobile } = useResponsive()

  // On mobile, show only last few items
  const visibleItems = isMobile && items.length > maxItems
    ? [...items.slice(0, 1), { label: '...', href: undefined }, ...items.slice(-maxItems + 1)]
    : items

  return (
    <nav className={cn('breadcrumb', className)} aria-label="Breadcrumb">
      <ol className="flex items-center space-x-2 text-sm">
        {visibleItems.map((item, index) => (
          <li key={index} className="flex items-center">
            {index > 0 && (
              <span className="mx-2 text-gray-400" aria-hidden="true">
                {separator}
              </span>
            )}
            {item.href || item.onClick ? (
              <a
                href={item.href}
                onClick={item.onClick}
                className={cn(
                  'transition-colors duration-200',
                  index === visibleItems.length - 1
                    ? 'text-gray-900 font-medium'
                    : 'text-blue-600 hover:text-blue-800'
                )}
              >
                {item.label}
              </a>
            ) : (
              <span className={cn(
                index === visibleItems.length - 1
                  ? 'text-gray-900 font-medium'
                  : 'text-gray-500'
              )}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

interface BottomNavigationProps {
  items: Array<{
    id: string
    icon: React.ReactNode
    label: string
    href?: string
    onClick?: () => void
    badge?: string | number
  }>
  activeItem?: string
  className?: string
}

export function BottomNavigation({
  items,
  activeItem,
  className = ''
}: BottomNavigationProps) {
  const { isMobile } = useResponsive()

  if (!isMobile) {
    return null
  }

  return (
    <nav className={cn(
      'fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-pb',
      className
    )}>
      <div className="flex">
        {items.map((item) => (
          <a
            key={item.id}
            href={item.href}
            onClick={item.onClick}
            className={cn(
              'flex-1 flex flex-col items-center justify-center py-2 px-1 transition-colors duration-200',
              'min-h-[60px] relative',
              activeItem === item.id
                ? 'text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            <div className="relative">
              {item.icon}
              {item.badge && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </div>
            <span className="text-xs mt-1 truncate max-w-full">
              {item.label}
            </span>
          </a>
        ))}
      </div>
    </nav>
  )
}