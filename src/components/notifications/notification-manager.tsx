'use client'

import { useState, useEffect, useCallback } from 'react'
import { useNotifications } from '@/lib/use-notifications'
import { Bell, BellOff, X, BellRing, ExternalLink, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

/**
 * Notification prompt banner that slides up from bottom
 * Shows on first visit to encourage enabling notifications
 */
export function NotificationPrompt() {
  const { permission, isSubscribed, subscribe, isLoading, error, isRestricted } = useNotifications()
  // Initialize dismissed from localStorage directly (lazy initializer, no effect needed)
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    return !!localStorage.getItem('zeng-notif-dismissed')
  })
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // If already dismissed, subscribed, permission not default, or restricted, don't schedule
    if (dismissed || permission !== 'default' || isRestricted) return
    // Show after a short delay
    const timer = setTimeout(() => {
      setVisible(true)
    }, 5000)
    return () => clearTimeout(timer)
  }, [dismissed, permission, isRestricted])

  const handleEnable = async () => {
    const success = await subscribe()
    if (success) {
      setVisible(false)
    }
    // Error feedback is handled by toast in useNotifications
  }

  const handleDismiss = useCallback(() => {
    setVisible(false)
    setDismissed(true)
    localStorage.setItem('zeng-notif-dismissed', 'true')
  }, [])

  const handleOpenDirect = () => {
    window.open(window.location.href, '_blank')
    handleDismiss()
  }

  // Don't show if already subscribed, denied, or unsupported
  if (permission === 'granted' || permission === 'denied' || permission === 'unsupported') {
    return null
  }

  return (
    <AnimatePresence>
      {visible && !dismissed && permission === 'default' && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-20 lg:bottom-6 left-4 right-4 lg:left-auto lg:right-6 lg:max-w-sm z-50"
        >
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-4 relative overflow-hidden">
            {/* Background accent */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-primary/50" />

            <button
              onClick={handleDismiss}
              className="absolute top-2 right-2 p-1 rounded-full hover:bg-secondary transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <BellRing className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0 pr-4">
                <h4 className="text-sm font-semibold mb-1">Stay Updated!</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Enable notifications to get instant alerts when new matches are added.
                </p>

                {isRestricted ? (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Open the site directly to enable notifications
                    </p>
                    <Button
                      size="sm"
                      onClick={handleOpenDirect}
                      className="h-8 text-xs gap-1.5"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open in New Tab
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleEnable}
                      disabled={isLoading}
                      className="h-8 text-xs gap-1.5"
                    >
                      {isLoading ? (
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Bell className="h-3.5 w-3.5" />
                      )}
                      Enable Notifications
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleDismiss}
                      className="h-8 text-xs"
                    >
                      Maybe Later
                    </Button>
                  </div>
                )}

                {error && !isRestricted && (
                  <p className="text-xs text-destructive mt-2">{error}</p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Notification bell button for the top nav
 */
export function NotificationBell() {
  const { permission, isSubscribed, toggleSubscription, subscribe, isLoading, error, isRestricted } = useNotifications()
  const [showTooltip, setShowTooltip] = useState<string | null>(null)

  // Always show bell — even if unsupported, clicking shows a helpful tooltip
  // (only hide if browser truly has no Notification API)

  const handleClick = async () => {
    if (isRestricted) {
      setShowTooltip('restricted')
      setTimeout(() => setShowTooltip(null), 4000)
      return
    }

    if (permission === 'unsupported') {
      setShowTooltip('unsupported')
      setTimeout(() => setShowTooltip(null), 4000)
      return
    }

    if (permission === 'granted' && isSubscribed) {
      // Toggle subscription
      await toggleSubscription()
    } else if (permission === 'default') {
      // Request permission and subscribe
      await subscribe()
    } else if (permission === 'denied') {
      // Show tooltip that notifications are blocked
      setShowTooltip('denied')
      setTimeout(() => setShowTooltip(null), 4000)
    }
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={handleClick}
        disabled={isLoading}
        title={isSubscribed ? 'Notifications enabled — click to disable' : 'Enable notifications'}
      >
        {isSubscribed ? (
          <Bell className="h-5 w-5" />
        ) : (
          <BellOff className="h-5 w-5 text-muted-foreground" />
        )}
        {isSubscribed && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full animate-live-pulse" />
        )}
        {isLoading && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
        )}
      </Button>

      {/* Tooltip for blocked/restricted notifications */}
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute top-full right-0 mt-2 bg-card border border-border rounded-lg shadow-xl p-3 text-xs max-w-[240px] z-50"
          >
            {showTooltip === 'denied' ? (
              <p className="text-muted-foreground">
                Notifications are blocked. Please enable them in your browser settings (click the 🔒 lock icon in the address bar).
              </p>
            ) : showTooltip === 'restricted' ? (
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Notifications require opening the site directly.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 w-full"
                  onClick={() => window.open(window.location.href, '_blank')}
                >
                  <ExternalLink className="h-3 w-3" />
                  Open in New Tab
                </Button>
              </div>
            ) : showTooltip === 'unsupported' ? (
              <p className="text-muted-foreground">
                Notifications are not available in this environment. Try opening the site directly in your browser.
              </p>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error tooltip */}
      {error && !showTooltip && permission === 'default' && (
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full" title={error} />
      )}
    </div>
  )
}
