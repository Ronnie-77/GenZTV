'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { TopNav } from './top-nav'
import { Sidebar } from './sidebar'
import { BottomNav } from './bottom-nav'
import { HomePage } from '@/views/home'
import { LivePage } from '@/views/live'
import { WatchPage } from '@/views/watch'
import { NewsPage } from '@/views/news'
import { SportsPage } from '@/views/sports'
import { CricketPage } from '@/views/cricket'
import { FootballPage } from '@/views/football'
import { EntertainmentPage } from '@/views/entertainment'
import { FavoritesPage } from '@/views/favorites'
import { SearchPage } from '@/views/search'
import { AdminPage } from '@/views/admin'
import { MorePage } from '@/views/more'
import { NotificationPrompt } from '@/components/notifications/notification-manager'
import { X, Download, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ── PWA Install Prompt (inlined to avoid missing file on Railway) ──
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return
    const dismissedTime = localStorage.getItem('zeng-install-dismissed')
    if (dismissedTime && Date.now() - parseInt(dismissedTime, 10) < 3 * 24 * 60 * 60 * 1000) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setTimeout(() => setShowPrompt(true), 3000)
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => {
      setShowPrompt(false)
      setDeferredPrompt(null)
    })

    return () => { window.removeEventListener('beforeinstallprompt', handler) }
  }, [])

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return
    try {
      await deferredPrompt.prompt()
      const result = await deferredPrompt.userChoice
      if (result.outcome === 'accepted') setShowPrompt(false)
    } catch { /* prompt failed */ }
    setDeferredPrompt(null)
  }, [deferredPrompt])

  const handleDismiss = useCallback(() => {
    setShowPrompt(false)
    localStorage.setItem('zeng-install-dismissed', Date.now().toString())
  }, [])

  if (!deferredPrompt || !showPrompt) return null

  return (
    <div className="fixed bottom-20 lg:bottom-6 left-4 right-4 lg:left-auto lg:right-6 lg:max-w-sm z-50 animate-fade-slide">
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-foreground to-muted-foreground" />
        <button onClick={handleDismiss} className="absolute top-2 right-2 p-1 rounded-full hover:bg-secondary transition-colors">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0 pr-4">
            <h4 className="text-sm font-semibold mb-1">Install GenZ TV</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Install the app on your device for quick access and a better experience.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleInstall} className="h-8 text-xs gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Install App
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDismiss} className="h-8 text-xs">
                Not Now
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
// ── End PWA Install Prompt ──

export function AppShell() {
  const { currentPage } = useAppStore()
  const mainRef = useRef<HTMLDivElement>(null)

  // Reset scroll position when page changes for independent tab scrolling
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    }
    // Also reset window scroll as fallback
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [currentPage])

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage />
      case 'live':
        return <LivePage />
      case 'watch':
        return <WatchPage />
      case 'news':
        return <NewsPage />
      case 'sports':
        return <SportsPage />
      case 'cricket':
        return <CricketPage />
      case 'football':
        return <FootballPage />
      case 'entertainment':
        return <EntertainmentPage />
      case 'favorites':
        return <FavoritesPage />
      case 'search':
        return <SearchPage />
      case 'admin':
        return <AdminPage />
      case 'more':
        return <MorePage />
      default:
        return <HomePage />
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="lg:hidden"><TopNav /><div className="h-14 shrink-0" /></div>
      <div className="flex flex-1">
        <Sidebar />
        <main ref={mainRef} className="flex-1 min-w-0 flex flex-col pb-16 lg:pb-0 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch', overflowScrolling: 'touch' }}>
          <div className="flex-1">
            {/* Simple key-based re-render instead of AnimatePresence for better mobile scroll performance */}
            <div key={currentPage}>
              {renderPage()}
            </div>
          </div>
          {/* Footer - sticky at bottom */}
          <footer className="mt-auto py-4 px-4 border-t border-border bg-background/50 hidden lg:block">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">GenZ TV</span>
                <span>•</span>
                <span>Premium Live Streaming</span>
              </div>
              <div className="flex items-center gap-4">
                <span>© 2025 GenZ TV</span>
                <span>v2.0</span>
              </div>
            </div>
          </footer>
        </main>
      </div>
      <BottomNav />
      <NotificationPrompt />
      <InstallPrompt />
    </div>
  )
}
