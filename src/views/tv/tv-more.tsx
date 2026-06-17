'use client'

import { useAppStore } from '@/lib/store'
import { Bell, BellOff, Tv as TvIcon, Monitor, Smartphone, ExternalLink, Sparkles, Heart, Shield } from 'lucide-react'
import { useNotifications } from '@/lib/use-notifications'
import { toast } from 'sonner'
import { useState, useEffect } from 'react'
import { type DeviceMode } from '@/lib/device-mode'

export function TVMore() {
  const { deviceMode, setDeviceMode, setCurrentPage } = useAppStore()
  const { permission, isSubscribed, toggleSubscription, subscribe, isLoading } = useNotifications()
  const [installPromptAvailable, setInstallPromptAvailable] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)

  // Capture PWA install prompt (works on Tizen/WebOS Chromium too)
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as any)
      setInstallPromptAvailable(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    try {
      await deferredPrompt.prompt()
      await deferredPrompt.userChoice
    } catch {
      // ignore
    }
    setDeferredPrompt(null)
    setInstallPromptAvailable(false)
  }

  const handleNotificationToggle = async () => {
    if (permission === 'granted') {
      const ok = await toggleSubscription()
      if (ok !== false) {
        toast(isSubscribed ? 'Notifications disabled' : 'Notifications enabled', { duration: 2000 })
      }
    } else if (permission === 'default') {
      const ok = await subscribe()
      if (ok) toast('Notifications enabled!', { duration: 2000 })
    } else {
      toast('Notifications are blocked. Enable them in browser settings.', { duration: 3000 })
    }
  }

  const switchMode = (mode: DeviceMode) => {
    setDeviceMode(mode)
    toast(`Switched to ${mode === 'tv' ? 'TV' : mode === 'mobile' ? 'Mobile' : 'Desktop'} mode`, {
      duration: 2000,
    })
  }

  return (
    <div style={{ maxWidth: '42rem', margin: '0 auto' }}>
      <div className="tv-section-header" style={{ marginBottom: '1.5rem' }}>
        <div className="tv-section-title">
          <Sparkles className="h-6 w-6" style={{ color: 'var(--primary)' }} />
          Settings
        </div>
      </div>

      {/* Device mode selector */}
      <section style={{ marginBottom: '2rem' }}>
        <h2
          style={{
            fontSize: '0.875rem',
            fontWeight: 700,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '0.875rem',
          }}
        >
          Display Mode
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
            gap: '0.875rem',
          }}
        >
          <ModeCard
            active={deviceMode === 'tv'}
            onClick={() => switchMode('tv')}
            icon={<TvIcon className="h-6 w-6" />}
            title="TV Mode"
            desc="10-foot UI with remote control navigation"
          />
          <ModeCard
            active={deviceMode === 'desktop'}
            onClick={() => switchMode('desktop')}
            icon={<Monitor className="h-6 w-6" />}
            title="Desktop"
            desc="Mouse & keyboard, full layout"
          />
          <ModeCard
            active={deviceMode === 'mobile'}
            onClick={() => switchMode('mobile')}
            icon={<Smartphone className="h-6 w-6" />}
            title="Mobile"
            desc="Touch-friendly compact layout"
          />
        </div>
        <p
          style={{
            fontSize: '0.8125rem',
            color: 'var(--muted-foreground)',
            marginTop: '0.75rem',
          }}
        >
          Tip: TV Mode is auto-detected on Smart TVs. You can switch back to Auto anytime.
        </p>
        <button
          className="tv-watch-stream-btn tv-focusable"
          data-tv-focus
          onClick={() => setDeviceMode('auto')}
          style={{ marginTop: '0.75rem' }}
        >
          Reset to Auto
        </button>
      </section>

      {/* Install app */}
      <section style={{ marginBottom: '2rem' }}>
        <h2
          style={{
            fontSize: '0.875rem',
            fontWeight: 700,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '0.875rem',
          }}
        >
          Install App
        </h2>
        <button
          className="tv-toggle-card tv-focusable"
          data-tv-focus
          data-active={installPromptAvailable ? 'true' : 'false'}
          onClick={handleInstall}
          disabled={!installPromptAvailable}
          style={{ opacity: installPromptAvailable ? 1 : 0.6, cursor: installPromptAvailable ? 'pointer' : 'default' }}
        >
          <div className="tv-toggle-icon">
            <TvIcon className="h-6 w-6" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '1.0625rem' }}>
              {installPromptAvailable ? 'Install GenZ TV' : 'Install not available'}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginTop: '0.2rem' }}>
              {installPromptAvailable
                ? 'Install as a native app on this TV for quick access.'
                : 'Use your TV browser’s “Add to Home screen” option to install.'}
            </div>
          </div>
        </button>
      </section>

      {/* Notifications */}
      <section style={{ marginBottom: '2rem' }}>
        <h2
          style={{
            fontSize: '0.875rem',
            fontWeight: 700,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '0.875rem',
          }}
        >
          Notifications
        </h2>
        <button
          className="tv-toggle-card tv-focusable"
          data-tv-focus
          data-active={isSubscribed ? 'true' : 'false'}
          onClick={handleNotificationToggle}
          disabled={isLoading}
        >
          <div className="tv-toggle-icon" style={isSubscribed ? { background: '#10b981', color: '#fff' } : undefined}>
            {isSubscribed ? <Bell className="h-6 w-6" /> : <BellOff className="h-6 w-6" />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '1.0625rem' }}>
              {isSubscribed ? 'Notifications Enabled' : 'Notifications Disabled'}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginTop: '0.2rem' }}>
              {permission === 'denied'
                ? 'Blocked by browser — enable in settings'
                : isSubscribed
                  ? 'Tap to disable push notifications'
                  : 'Tap to enable push notifications'}
            </div>
          </div>
        </button>
      </section>

      {/* Social */}
      <section style={{ marginBottom: '2rem' }}>
        <h2
          style={{
            fontSize: '0.875rem',
            fontWeight: 700,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '0.875rem',
          }}
        >
          Connect
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <a
            className="tv-toggle-card tv-focusable"
            data-tv-focus
            href="https://www.facebook.com/ronnie.7r"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="tv-toggle-icon" style={{ background: '#1877f2', color: '#fff' }}>
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '1.0625rem' }}>Facebook</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginTop: '0.2rem' }}>
                Follow us for updates &amp; news
              </div>
            </div>
            <ExternalLink className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
          </a>

          <a
            className="tv-toggle-card tv-focusable"
            data-tv-focus
            href="https://t.me/ronnie77a"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="tv-toggle-icon" style={{ background: '#0088cc', color: '#fff' }}>
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '1.0625rem' }}>Telegram</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginTop: '0.2rem' }}>
                Join our channel for live alerts
              </div>
            </div>
            <ExternalLink className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
          </a>
        </div>
      </section>

      {/* Admin */}
      <section style={{ marginBottom: '2rem' }}>
        <h2
          style={{
            fontSize: '0.875rem',
            fontWeight: 700,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '0.875rem',
          }}
        >
          Quick Access
        </h2>
        <button
          className="tv-toggle-card tv-focusable"
          data-tv-focus
          onClick={() => setCurrentPage('admin')}
        >
          <div className="tv-toggle-icon">
            <Shield className="h-6 w-6" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '1.0625rem' }}>Admin Panel</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginTop: '0.2rem' }}>
              Optimized for desktop / mobile
            </div>
          </div>
        </button>
      </section>

      {/* About */}
      <section style={{ marginBottom: '2rem' }}>
        <div
          className="tv-toggle-card"
          style={{ cursor: 'default', display: 'block' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.875rem' }}>
            <div className="tv-toggle-icon">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.25rem' }}>GenZ TV</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Premium Live Streaming</div>
            </div>
          </div>
          <p style={{ fontSize: '0.9375rem', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
            Your premium destination for live TV, sports, cricket, football &amp; entertainment.
            Watch your favorite channels anytime, anywhere.
          </p>
          <div
            style={{
              marginTop: '0.875rem',
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              fontSize: '0.8125rem',
              color: 'var(--muted-foreground)',
            }}
          >
            <span style={{ padding: '0.2rem 0.625rem', background: 'var(--secondary)', borderRadius: '9999px', fontWeight: 700, fontSize: '0.7rem' }}>v2.0</span>
            <span>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <Heart className="h-3 w-3" fill="currentColor" /> Made by Ronnie
            </span>
          </div>
        </div>
      </section>

      <div style={{ textAlign: 'center', paddingBottom: '2rem', color: 'var(--muted-foreground)', fontSize: '0.8125rem' }}>
        © {new Date().getFullYear()} GenZ TV. All rights reserved.
      </div>
    </div>
  )
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  desc: string
}) {
  return (
    <button
      className="tv-toggle-card tv-focusable"
      data-tv-focus
      data-active={active ? 'true' : 'false'}
      onClick={onClick}
      style={{
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '0.625rem',
        borderColor: active ? 'var(--primary)' : undefined,
      }}
    >
      <div className="tv-toggle-icon">{icon}</div>
      <div style={{ fontWeight: 700, fontSize: '1rem' }}>{title}</div>
      <div style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
        {desc}
      </div>
    </button>
  )
}
