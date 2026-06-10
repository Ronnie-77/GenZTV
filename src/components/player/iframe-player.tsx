'use client'

import { useRef, useEffect, useState } from 'react'

interface IframePlayerProps {
  src: string
  onReady?: () => void
  onError?: (error: string) => void
}

export function IframePlayer({ src, onReady, onError }: IframePlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loaded, setLoaded] = useState(false)

  // Extract URL from iframe HTML if full iframe tag is provided
  const getSrcUrl = (input: string): string => {
    // If it's a full iframe tag, extract src attribute
    const srcMatch = input.match(/src=["']([^"']+)["']/)
    if (srcMatch) return srcMatch[1]
    // If it's already a URL, return as-is
    if (input.startsWith('http') || input.startsWith('/')) return input
    return input
  }

  const url = getSrcUrl(src)

  // ── Plan B: Try to auto-unmute iframe video ──
  // For same-origin iframes, we can access the content and unmute programmatically.
  // For cross-origin iframes, this will silently fail (which is expected).
  useEffect(() => {
    if (!loaded || !iframeRef.current) return

    const tryAutoUnmute = () => {
      try {
        const iframeDoc = iframeRef.current?.contentDocument
        if (iframeDoc) {
          // Find all video elements inside iframe and unmute them
          const videos = iframeDoc.querySelectorAll('video')
          videos.forEach((v: HTMLVideoElement) => {
            v.muted = false
            v.volume = 1
            // Try to play with sound
            v.play().catch(() => {
              // Autoplay with sound blocked by browser — revert to muted autoplay
              v.muted = true
              v.play().catch(() => {})
            })
          })

          // Also try to find and click any "unmute" buttons inside iframe
          const unmuteButtons = iframeDoc.querySelectorAll(
            '[class*="unmute"], [class*="Unmute"], [aria-label*="unmute"], [aria-label*="Unmute"], [title*="unmute"], [title*="Unmute"], button[class*="muted"]'
          )
          unmuteButtons.forEach((btn: Element) => {
            try { (btn as HTMLElement).click() } catch {}
          })
        }
      } catch {
        // Cross-origin — can't access iframe content, expected
      }
    }

    // Try after a short delay to let the iframe content load
    const timer1 = setTimeout(tryAutoUnmute, 1500)
    const timer2 = setTimeout(tryAutoUnmute, 3000)
    const timer3 = setTimeout(tryAutoUnmute, 5000)

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
      clearTimeout(timer3)
    }
  }, [loaded, url])

  // ── Aggressive Popup / Ad Blocker (Desktop + Mobile) ──
  useEffect(() => {
    // 1. Override window.open — block all popups from opening
    const originalOpen = window.open
    window.open = function (...args) {
      // Completely block — return null, don't even open the window
      return null
    }

    // 2. Override window.close — try to close any new windows
    const originalClose = window.close

    // 3. Track opened popup windows reference for cleanup
    const popupWindows: Window[] = []

    // 4. When our window loses focus (popup/new tab opened), aggressively refocus
    const handleBlur = () => {
      setTimeout(() => {
        window.focus()
        // Close any tracked popup windows
        popupWindows.forEach(w => {
          try { w.close() } catch {}
        })
      }, 30)
    }

    // 5. When tab becomes hidden (mobile: new tab opened), bring back
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        window.focus()
      }
    }

    // 6. Block beforeunload — prevent navigation away from our page
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // This shows a browser confirmation — prevents silent navigation
      e.preventDefault()
    }

    // 7. Mobile-specific: Handle pagehide event (when page is hidden on mobile)
    const handlePageHide = (e: PageTransitionEvent) => {
      // Try to prevent the page from being hidden
      e.preventDefault()
    }

    // 8. Intercept click events on the document to prevent target="_blank" links
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a')
      if (anchor) {
        const targetAttr = anchor.getAttribute('target')
        if (targetAttr === '_blank') {
          e.preventDefault()
          e.stopPropagation()
          // Don't open the link in a new tab
          return false
        }
      }
    }

    window.addEventListener('blur', handleBlur)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('click', handleDocumentClick, true) // capture phase

    // Mobile events
    window.addEventListener('pagehide', handlePageHide as EventListener)

    // Cleanup
    return () => {
      window.open = originalOpen
      window.close = originalClose
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('click', handleDocumentClick, true)
      window.removeEventListener('pagehide', handlePageHide as EventListener)
      // Close any remaining popup windows
      popupWindows.forEach(w => {
        try { w.close() } catch {}
      })
    }
  }, [])

  // Periodic focus check — ensures our window stays focused even if popup steals it
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hasFocus()) {
        window.focus()
      }
    }, 300)

    return () => clearInterval(interval)
  }, [])

  // Close any new tabs/windows that were opened — aggressive periodic check
  useEffect(() => {
    // Store the initial number of windows
    let windowCount = 0

    const checkForNewWindows = () => {
      // If window lost focus, try to regain it
      if (!document.hasFocus()) {
        window.focus()
      }
    }

    const interval = setInterval(checkForNewWindows, 200)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <iframe
        ref={iframeRef}
        src={url}
        className="w-full h-full border-0"
        style={{ overflow: 'hidden' }}
        scrolling="no"
        // sandbox: blocks popups, top-navigation, and downloads
        // allow-same-origin: needed for video playback + our auto-unmute attempt
        // allow-scripts: needed for player JS
        // allow-forms: needed for form interactions
        // allow-presentation: needed for casting/presentation API
        // NOT included: allow-popups, allow-top-navigation, allow-downloads, allow-popups-to-escape-sandbox
        sandbox="allow-same-origin allow-scripts allow-forms allow-presentation"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="no-referrer"
        onLoad={() => {
          setLoaded(true)
          onReady?.()
        }}
        onError={() => onError?.('Failed to load iframe')}
      />
    </div>
  )
}
