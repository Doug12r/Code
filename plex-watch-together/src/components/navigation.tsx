'use client'

import { Button } from '@/components/ui/button'
import { PlayIcon, HomeIcon, UsersIcon, FilmIcon, SettingsIcon } from 'lucide-react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { MoonIcon, SunIcon } from '@radix-ui/react-icons'
import { useSession, signOut } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { ResponsiveNav, NavItem, DropdownNav } from '@/components/ui/responsive-navigation'
import { BottomNavigation } from '@/components/ui/responsive-navigation'
import { cn } from '@/lib/utils'

export function Navigation() {
  const { theme, setTheme } = useTheme()
  const { data: session } = useSession()
  const pathname = usePathname()

  const isActive = (path: string) => pathname === path

  if (!session) {
    // Public navigation for non-authenticated users
    return (
      <ResponsiveNav
        logo={
          <Link href="/" className="flex items-center space-x-2">
            <PlayIcon className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">Plex Watch Together</span>
          </Link>
        }
        variant="sticky"
      >
        <NavItem href="/" active={isActive('/')}>
          <HomeIcon className="h-4 w-4 mr-2" />
          Home
        </NavItem>

        <div className="ml-auto flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="h-9 w-9 px-0"
          >
            <SunIcon className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <MoonIcon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
          
          <Link href="/auth/signin">
            <Button variant="outline">Sign In</Button>
          </Link>
          
          <Link href="/auth/signin">
            <Button>Get Started</Button>
          </Link>
        </div>
      </ResponsiveNav>
    )
  }

  // Authenticated user navigation
  const bottomNavItems = [
    {
      id: 'home',
      icon: <HomeIcon className="w-5 h-5" />,
      label: 'Home',
      href: '/dashboard'
    },
    {
      id: 'rooms',
      icon: <UsersIcon className="w-5 h-5" />,
      label: 'Rooms',
      href: '/rooms'
    },
    {
      id: 'library',
      icon: <FilmIcon className="w-5 h-5" />,
      label: 'Library',
      href: '/library'
    },
    {
      id: 'settings',
      icon: <SettingsIcon className="w-5 h-5" />,
      label: 'Settings',
      href: '/settings'
    }
  ]

  const activeItem = bottomNavItems.find(item => pathname.startsWith(item.href))?.id

  return (
    <>
      <ResponsiveNav
        logo={
          <Link href="/dashboard" className="flex items-center space-x-2">
            <PlayIcon className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold hidden sm:inline">Plex Watch Together</span>
            <span className="text-xl font-bold sm:hidden">PWT</span>
          </Link>
        }
        variant="sticky"
        className="border-b"
      >
        {/* Desktop Navigation Items */}
        <NavItem 
          href="/dashboard" 
          active={isActive('/dashboard')}
          className="hidden md:flex"
        >
          <HomeIcon className="h-4 w-4 mr-2" />
          Dashboard
        </NavItem>

        <NavItem 
          href="/rooms" 
          active={pathname.startsWith('/rooms') || pathname.startsWith('/room/')}
          className="hidden md:flex"
        >
          <UsersIcon className="h-4 w-4 mr-2" />
          Watch Rooms
        </NavItem>

        <NavItem 
          href="/library" 
          active={pathname.startsWith('/library')}
          className="hidden md:flex"
        >
          <FilmIcon className="h-4 w-4 mr-2" />
          Media Library
        </NavItem>

        {/* User Menu - Desktop */}
        <div className="ml-auto hidden md:flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="h-9 w-9 px-0"
          >
            <SunIcon className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <MoonIcon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>

          <DropdownNav
            trigger={
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-medium">
                    {session.user?.name?.[0] || session.user?.email?.[0] || 'U'}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground hidden lg:block">
                  {session.user?.name || session.user?.email}
                </span>
              </div>
            }
          >
            <NavItem href="/settings">
              <SettingsIcon className="h-4 w-4 mr-2" />
              Settings
            </NavItem>
            <NavItem 
              onClick={() => signOut()}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              Sign Out
            </NavItem>
          </DropdownNav>
        </div>

        {/* Mobile User Menu */}
        <div className="ml-auto md:hidden flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="h-9 w-9 px-0"
          >
            <SunIcon className="h-4 w-4" />
            <MoonIcon className="absolute h-4 w-4" />
          </Button>
          
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-medium">
              {session.user?.name?.[0] || session.user?.email?.[0] || 'U'}
            </span>
          </div>
        </div>
      </ResponsiveNav>

      {/* Mobile Bottom Navigation */}
      <BottomNavigation
        items={bottomNavItems}
        activeItem={activeItem}
      />

      {/* Add bottom padding for mobile devices to account for bottom navigation */}
      <style jsx global>{`
        @media (max-width: 768px) {
          body {
            padding-bottom: 80px;
          }
        }
      `}</style>
    </>
  )
}