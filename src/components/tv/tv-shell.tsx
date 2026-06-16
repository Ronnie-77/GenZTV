'use client'

import { useEffect, useState, lazy, Suspense } from 'react'
import { useAppStore, type PageName } from '@/lib/store'
import { useTVSpatialNav, useTVFocusOnPageChange } from '@/lib/tv-spatial-nav'
import { TVClock } from './tv-clock'
import { ErrorBoundary } from '@/components/error-boundary'
import {
  Home,
  Radio,
  Trophy,
  Trophy as CricketIcon,
  Trophy as FootballIcon,
  Newspaper,
  Film,
  Heart,
  Search,
  Settings as SettingsIcon,
  Zap,
} from 'lucide-react'

// Lazy-load TV page components
const TVHome = lazy(() => import('@/views/tv/tv-home').then((m) => ({ default: m.TVHome })))
const TVWatch = lazy(() => import('@/views/tv/tv-watch').then((m) => ({ default: m.TVWatch })))
const TVChannels = lazy(() => import('@/views/tv/tv-channels').then((m) => ({ default: m.TVChannels })))
const TVSearch = lazy(() => import('@/views/tv/tv-search').then((m) => ({ default: m.TVSearch })))
const TVMore = lazy(() => import('@/views/tv/tv-more').then((m) => ({ default: m.TVMore })))

interface RailItem {
  page: PageName
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const RAIL_ITEMS: RailItem[] = [
  { page: 'home', label: 'Home', icon: Home },
  { page: 'live', label: 'Live TV', icon: Radio },
  { page: 'sports', label: 'Sports', icon: Trophy },
  { page: 'cricket', label: 'Cricket', icon: CricketIcon },
  { page: 'football', label: 'Football', icon: FootballIcon },
  { page: 'news', label: 'News', icon: Newspaper },
  { page: 'entertainment', label: 'Entertainment', icon: Film },
  { page: 'favorites', label: 'Favorites', icon: Heart },
  { page: 'search', label: 'Search', icon: Search },
  { page: 'more', label: 'More', icon: SettingsIcon },
]

export function TVShell() {
  const { currentPage, setCurrentPage, deviceMode } = useAppStore()

  const isTV = deviceMode === 'tv'

  // Attach D-pad navigation only in TV mode
  useTVSpatialNav(isTV)
  // Re-focus first element on page change
  useTVFocusOnPageChange(currentPage + (useAppStore.getState().currentChannelId || ''), isTV)

  // Add body class for TV-mode-specific CSS
  useEffect(() => {
    if (isTV) {
      document.body.classList.add('tv-mode')
    } else {
      document.body.classList.remove('tv-mode')
    }
    return () => {
      document.body.classList.remove('tv-mode')
    }
  }, [isTV])

  const handleRailClick = (page: PageName) => {
    setCurrentPage(page)
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <TVHome />
      case 'watch':
        return <TVWatch />
      case 'live':
        return <TVChannels mode="all" title="Live TV" />
      case 'sports':
        return <TVChannels mode="category" category="sports" title="Sports" />
      case 'cricket':
        return <TVChannels mode="category" category="cricket" title="Cricket" />
      case 'football':
        return <TVChannels mode="category" category="football" title="Football" />
      case 'news':
        return <TVChannels mode="category" category="news" title="News" />
      case 'entertainment':
        return <TVChannels mode="category" category="entertainment" title="Entertainment" />
      case 'favorites':
        return <TVChannels mode="favorites" title="Favorites" />
      case 'search':
        return <TVSearch />
      case 'more':
        return <TVMore />
      case 'admin':
        // Admin is not TV-optimized — show a message
        return <TVAdminNotice />
      default:
        return <TVHome />
    }
  }

  return (
    <div className="tv-shell">
      {/* Top bar */}
      <header className="tv-topbar">
        <button
          className="tv-topbar-brand tv-focusable"
          data-tv-focus
          onClick={() => setCurrentPage('home')}
          aria-label="GenZ TV home"
          style={{ background: 'transparent', border: '2px solid transparent' }}
        >
          <Zap className="h-7 w-7 text-primary" fill="currentColor" />
          <span>
            GenZ <span className="text-primary">TV</span>
          </span>
        </button>
        <TVClock />
      </header>

      {/* Body: rail + main */}
      <div className="tv-body">
        <nav className="tv-rail" aria-label="Main navigation">
          {RAIL_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = currentPage === item.page
            return (
              <button
                key={item.page}
                className="tv-rail-item tv-focusable"
                data-tv-focus
                data-active={isActive ? 'true' : 'false'}
                onClick={() => handleRailClick(item.page)}
                style={
                  isActive
                    ? {
                        background: 'var(--secondary)',
                        color: 'var(--foreground)',
                        borderColor: 'color-mix(in srgb, var(--primary) 35%, transparent)',
                      }
                    : undefined
                }
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <main className="tv-main" id="tv-main">
          <ErrorBoundary>
            <Suspense
              fallback={
                <div style={{ padding: '3rem', textAlign: 'center' }}>
                  <div
                    className="tv-skeleton"
                    style={{ width: '60%', height: '2rem', margin: '0 auto 1rem' }}
                  />
                  <div
                    className="tv-skeleton"
                    style={{ width: '40%', height: '1.25rem', margin: '0 auto' }}
                  />
                </div>
              }
            >
              {renderPage()}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      {/* Remote hint — shows once on first load */}
      <RemoteHint />
    </div>
  )
}

/** One-time on-screen hint telling the user how to use the remote. */
function RemoteHint() {
  // Initialize lazily: show only if the user hasn't seen it before.
  const [show, setShow] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      const seen = localStorage.getItem('zeng-tv-hint-seen')
      if (!seen) {
        localStorage.setItem('zeng-tv-hint-seen', '1')
        return true
      }
    } catch {
      // ignore
    }
    return false
  })

  useEffect(() => {
    if (!show) return
    const t = window.setTimeout(() => setShow(false), 5000)
    return () => window.clearTimeout(t)
  }, [show])

  if (!show) return null
  return (
    <div className="tv-remote-hint" role="status">
      <span>
        <kbd>← ↑ ↓ →</kbd> Navigate
      </span>
      <span>
        <kbd>OK</kbd> Select
      </span>
      <span>
        <kbd>Back</kbd> Return
      </span>
    </div>
  )
}

/** Notice shown when admin page is opened in TV mode. */
function TVAdminNotice() {
  return (
    <div className="tv-empty" style={{ maxWidth: '40rem', margin: '2rem auto' }}>
      <div className="tv-empty-title">Admin Panel</div>
      <p style={{ marginBottom: '1.5rem' }}>
        The admin panel is optimized for desktop and mobile. To manage channels,
        matches and settings, please switch to phone or PC mode (More → TV Mode → off),
        or open the admin URL directly on a computer.
      </p>
      <button
        className="tv-btn-primary tv-focusable"
        data-tv-focus
        onClick={() => useAppStore.getState().setCurrentPage('more')}
      >
        Go to More
      </button>
    </div>
  )
}
