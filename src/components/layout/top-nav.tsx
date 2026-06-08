'use client'

import { useAppStore } from '@/lib/store'
import { Search, Menu, Tv } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useState } from 'react'
import { NotificationBell } from '@/components/notifications/notification-manager'

export function TopNav() {
  const { setCurrentPage, setSearchQuery, setSidebarOpen } = useAppStore()
  const [searchExpanded, setSearchExpanded] = useState(false)

  return (
    <header className="sticky top-0 z-50 glass bg-background md:bg-background/80">
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

        {/* Center: Search (desktop only) */}
        <div className="flex-1 max-w-md mx-auto hidden sm:block">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search channels..."
              className="pl-9 bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary h-9"
              onFocus={() => setCurrentPage('search')}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Right: Search (mobile) + Notification */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            onClick={() => {
              setCurrentPage('search')
              setSearchExpanded(true)
            }}
          >
            <Search className="h-5 w-5" />
          </Button>
          <NotificationBell />
        </div>
      </div>
    </header>
  )
}
