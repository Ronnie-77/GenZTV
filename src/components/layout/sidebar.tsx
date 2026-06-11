'use client'

import { useState } from 'react'
import { useTheme } from 'next-themes'
import { useAppStore, type PageName } from '@/lib/store'
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
  Search,
  Settings,
  X,
  Zap,
  Moon,
  Sun,
  Monitor,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useMounted } from '@/hooks/use-mounted'

const navItems: { icon: React.ElementType; label: string; page: PageName; badge?: string }[] = [
  { icon: Home, label: 'Home', page: 'home' },
  { icon: Tv, label: 'Channels', page: 'live' },
  { icon: Newspaper, label: 'News', page: 'news' },
  { icon: Trophy, label: 'Sports', page: 'sports' },
  { icon: Target, label: 'Cricket', page: 'cricket' },
  { icon: CircleDot, label: 'Football', page: 'football' },
  { icon: Film, label: 'Entertainment', page: 'entertainment' },
  { icon: Heart, label: 'Favorites', page: 'favorites' },
  { icon: Search, label: 'Search', page: 'search' },
]

export function Sidebar() {
  const { currentPage, setCurrentPage, sidebarOpen, setSidebarOpen, isAdminAuth } = useAppStore()
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()
  const [themeOpen, setThemeOpen] = useState(false)

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
          'fixed top-0 left-0 z-50 h-full w-64 bg-sidebar transition-transform duration-300 ease-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Mobile Close */}
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

        {/* Desktop Header */}
        <div className="hidden lg:flex items-center h-14 px-4">
          <div className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-foreground" />
            <span className="font-bold text-lg">
              <span className="text-foreground">GenZ</span><span className="text-muted-foreground"> TV</span>
            </span>
          </div>
        </div>

        <ScrollArea className="h-[calc(100%-3.5rem)] lg:h-[calc(100vh-3.5rem)] px-3 py-4">
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

          {/* Theme Dropdown — below Search */}
          {mounted && (
            <div className="mt-3 px-1">
              <button
                onClick={() => setThemeOpen(!themeOpen)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200 btn-press"
              >
                {theme === 'dark' ? (
                  <Moon className="h-5 w-5 shrink-0 text-foreground" />
                ) : theme === 'light' ? (
                  <Sun className="h-5 w-5 shrink-0 text-amber-500" />
                ) : (
                  <Monitor className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <span>Theme</span>
                <ChevronDown className={cn('h-4 w-4 ml-auto transition-transform duration-200', themeOpen && 'rotate-180')} />
              </button>
              {themeOpen && (
                <div className="mt-1 space-y-0.5 pl-3">
                  {[
                    { value: 'light', icon: Sun, label: 'Light', color: 'text-amber-500' },
                    { value: 'dark', icon: Moon, label: 'Dark', color: 'text-foreground' },
                    { value: 'system', icon: Monitor, label: 'System', color: 'text-muted-foreground' },
                  ].map((opt) => {
                    const Icon = opt.icon
                    return (
                      <button
                        key={opt.value}
                        onClick={() => { setTheme(opt.value); setThemeOpen(false) }}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 btn-press',
                          theme === opt.value
                            ? 'bg-secondary text-foreground font-medium'
                            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                        )}
                      >
                        <Icon className={cn('h-4 w-4 shrink-0', opt.color)} />
                        <span>{opt.label}</span>
                        {theme === opt.value && (
                          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-foreground" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

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
                </button>
              </div>
            </>
          )}

          <Separator className="my-4 bg-sidebar-border" />

          {/* Bottom info */}
          <div className="mt-auto px-3 pt-4">
            <div className="bg-secondary/50 rounded-xl p-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground mb-0.5">GenZ TV v1.0</p>
              <p>Premium live streaming platform</p>
            </div>
          </div>
        </ScrollArea>
      </aside>
    </>
  )
}
