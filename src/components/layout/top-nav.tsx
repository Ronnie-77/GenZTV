// v15 — Mobile search box moved to center of topbar
'use client'

import { useAppStore } from '@/lib/store'
import { Search, Menu, Tv } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NotificationBell } from '@/components/notifications/notification-manager'

export function TopNav() {
  const { setCurrentPage, setSearchQuery, setSidebarOpen } = useAppStore()

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background md:sticky md:glass md:bg-background/80">
      <div className="flex items-center justify-between h-14 px-4 gap-3">
        {/* Left: Menu + Logo */}
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden shrink-0"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-7 w-7" />
          </Button>
          <button
            onClick={() => setCurrentPage('home')}
            className="flex items-center gap-2 shrink-0 group"
          >
            <div className="relative">
              <Tv className="h-7 w-7 text-foreground" />
            </div>
            <span className="font-bold text-lg hidden sm:block">
              <span className="text-foreground">GenZ</span>
              <span className="text-muted-foreground"> TV</span>
            </span>
          </button>
        </div>

        {/* Center: Search box */}
        <div className="flex-1 max-w-md mx-auto">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              className="pl-8 bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary h-8 text-xs sm:text-sm sm:h-9 sm:pl-9"
              onFocus={() => setCurrentPage('search')}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Right: Notification */}
        <div className="flex items-center gap-1 shrink-0">
          <NotificationBell />
        </div>
      </div>
    </header>
  )
}
