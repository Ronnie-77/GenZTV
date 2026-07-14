'use client'

import { useAppStore, type PageName } from '@/lib/store'
import { useAuth } from '@/lib/use-auth'
import { cn } from '@/lib/utils'
import {
  Home,
  Tv,
  Newspaper,
  Trophy,
  Target,
  CircleDot,
  Film,
  Heart,
  Settings,
  X,
  Zap,
  ChevronRight,
  History,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const navItems: { icon: React.ElementType; label: string; page: PageName; badge?: string }[] = [
  { icon: Home, label: 'Home', page: 'home' },
  { icon: Tv, label: 'Channels', page: 'live' },
  { icon: Newspaper, label: 'News', page: 'news' },
  { icon: Trophy, label: 'Sports', page: 'sports' },
  { icon: Target, label: 'Cricket', page: 'cricket' },
  { icon: CircleDot, label: 'Football', page: 'football' },
  { icon: Film, label: 'Entertainment', page: 'entertainment' },
  { icon: Heart, label: 'Favorites', page: 'favorites' },
  { icon: History, label: 'History', page: 'history' },
]

export function Sidebar() {
  const { currentPage, setCurrentPage, sidebarOpen, setSidebarOpen, isAdminAuth } = useAppStore()
  const { user, isLoggedIn, login } = useAuth()

  const handleNav = (page: PageName) => {
    setCurrentPage(page)
    setSidebarOpen(false)
  }

  return (
    <>
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-64 bg-sidebar transition-transform duration-300 ease-out border-r border-sidebar-border',
          // Desktop: fixed position below TopNav, doesn't scroll with main content
          'lg:fixed lg:top-14 lg:left-0 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 lg:z-30',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Mobile Header */}
        <div className="flex items-center justify-between h-14 px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-foreground" />
            <span className="font-bold text-lg">
              <span className="text-foreground">GenZ</span><span className="text-muted-foreground"> TV</span>
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Desktop: No header needed — TopNav handles the logo */}
        {/* ScrollArea with own scrollbar - full height below TopNav */}
        <ScrollArea className="h-[calc(100%-3.5rem)] lg:h-full px-3 py-4">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = currentPage === item.page
              return (
                <button
                  key={item.page}
                  onClick={() => handleNav(item.page)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 btn-press',
                    isActive
                      ? 'bg-[#E8E8ED] dark:bg-[#3A3A3C] text-foreground font-semibold'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )}
                >
                  <Icon className={cn('h-5 w-5 shrink-0', isActive ? 'text-foreground' : 'text-sidebar-foreground/80')} />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="ml-auto text-xs bg-zeng-live text-white px-1.5 py-0.5 rounded-full animate-live-pulse">
                      {item.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* Admin Section — only visible after server-side login */}
          {isAdminAuth && (
            <>
              <Separator className="my-4 bg-sidebar-border" />
              <div className="space-y-1">
                <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Admin
                </p>
                <button
                  onClick={() => handleNav('admin')}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 btn-press',
                    currentPage === 'admin'
                      ? 'bg-[#E8E8ED] dark:bg-[#3A3A3C] text-foreground font-semibold'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )}
                >
                  <Settings className={cn('h-5 w-5 shrink-0', currentPage === 'admin' ? 'text-foreground' : 'text-sidebar-foreground/80')} />
                  <span>Admin Panel</span>
                  <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
                </button>
              </div>
            </>
          )}

          <Separator className="my-4 bg-sidebar-border" />

          {/* Bottom section - Login button or User profile */}
          <div className="mt-auto px-3 pt-4">
            {isLoggedIn && user ? (
              <button
                onClick={() => handleNav('more')}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-secondary/50 hover:bg-secondary/70 transition-colors"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage
                    src={user.picture}
                    alt={user.name}
                    referrerPolicy="no-referrer"
                    className="object-cover"
                  />
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {user.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ) : (
              <button
                onClick={login}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl bg-white dark:bg-white/10 border border-gray-200 dark:border-white/20 hover:bg-gray-50 dark:hover:bg-white/15 hover:shadow-sm transition-all duration-200 group text-left"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span className="font-medium text-gray-700 dark:text-gray-200 text-sm">Sign in with Google</span>
              </button>
            )}
          </div>
        </ScrollArea>
      </aside>
    </>
  )
}