'use client'

import { useRef, useEffect, useState, useCallback } from 'react'

interface IframePlayerProps {
  src: string
  onReady?: () => void
  onError?: (error: string) => void
  /** The original unproxied URL — used to construct the proxy fallback URL */
  originalUrl?: string
  /** Callback when the player switches from direct to proxy mode */
  onSwitchToProxy?: () => void
}

/**
 * IframePlayer — dual-mode iframe loader for embed streams.
 *
 * Strategy:
 * 1. Try loading the iframe URL directly first (preserves original domain context
 *    so video players/CDNs that check origin work correctly).
 * 2. If the direct load fails (error event) or times out (8 seconds without onReady),
 *    automatically retry with the iframe proxy URL which strips X-Frame-Options.
 *
 * The addAutoplay function has been REMOVED — it broke pages that use the hash
 * fragment for routing or configuration (e.g., #player=clappr&autoplay=1).
 */
export function IframePlayer({ src, onReady, onError, originalUrl, onSwitchToProxy }: IframePlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [mode, setMode] = useState<'direct' | 'proxy'>('direct')
  const readyFiredRef = useRef(false)
  const modeSwitchedRef = useRef(false)

  // Extract URL from iframe HTML if a full iframe tag is provided
  const getSrcUrl = (input: string): string => {
    const srcMatch = input.match(/src=["']([^"']+)["']/)
    if (srcMatch) return srcMatch[1]
    if (input.startsWith('http') || input.startsWith('/') || input.startsWith('/api/')) return input
    return input
  }

  // Compute the URLs for each mode
  const extractedUrl = getSrcUrl(src)
  const directUrl = extractedUrl
  const proxyUrl = `/api/iframe-proxy?url=${encodeURIComponent(originalUrl || extractedUrl)}`
  const currentUrl = mode === 'direct' ? directUrl : proxyUrl

  // Switch to proxy mode when direct loading fails
  const switchToProxy = useCallback(() => {
    if (modeSwitchedRef.current) return // Already switched
    modeSwitchedRef.current = true
    console.log('[iframe-player] Direct load failed, switching to proxy mode')
    setMode('proxy')
    onSwitchToProxy?.()
  }, [onSwitchToProxy])

  // Handle iframe load event
  const handleLoad = useCallback(() => {
    readyFiredRef.current = true
    onReady?.()
  }, [onReady])

  // Handle iframe error event
  const handleError = useCallback(() => {
    if (mode === 'direct') {
      // Direct load failed — try proxy mode
      switchToProxy()
    } else {
      // Proxy mode also failed
      onError?.('Failed to load iframe (both direct and proxy modes failed)')
    }
  }, [mode, switchToProxy, onError])

  // Timeout: if direct iframe doesn't trigger onReady within 8 seconds, switch to proxy
  useEffect(() => {
    if (mode !== 'direct') return

    const timer = setTimeout(() => {
      if (!readyFiredRef.current) {
        console.log('[iframe-player] Direct load timeout (8s), switching to proxy mode')
        switchToProxy()
      }
    }, 8000)

    return () => clearTimeout(timer)
  }, [mode, switchToProxy])

  // ── Popup / Ad Blocker (Parent-level) ──
  // Since the iframe is cross-origin, we can't inject scripts inside it.
  // We block popups at the parent window level and refocus when ads steal focus.
  useEffect(() => {
    // 1. Override window.open — block all popups
    const originalOpen = window.open
    window.open = function () {
      return null
    }

    // 2. When window loses focus (popup/new tab opened), aggressively refocus
    const handleBlur = () => {
      setTimeout(() => window.focus(), 10)
      setTimeout(() => window.focus(), 100)
      setTimeout(() => window.focus(), 300)
      setTimeout(() => window.focus(), 600)
    }

    // 3. When tab becomes hidden (mobile: new tab opened), bring back
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        window.focus()
      }
    }

    // 4. Intercept click events to prevent target="_blank" links
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a')
      if (anchor) {
        const targetAttr = anchor.getAttribute('target')
        const href = anchor.getAttribute('href')
        if (targetAttr === '_blank' || (href && href.startsWith('http') && !href.includes(window.location.hostname))) {
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          return false
        }
      }
    }

    // 5. Intercept touchstart for mobile ad clicks
    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a')
      if (anchor) {
        const targetAttr = anchor.getAttribute('target')
        const href = anchor.getAttribute('href')
        if (targetAttr === '_blank' || (href && href.startsWith('http') && !href.includes(window.location.hostname))) {
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
        }
      }
    }

    window.addEventListener('blur', handleBlur)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('click', handleDocumentClick, true)
    document.addEventListener('touchstart', handleTouchStart, true)

    return () => {
      window.open = originalOpen
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('click', handleDocumentClick, true)
      document.removeEventListener('touchstart', handleTouchStart, true)
    }
  }, [])

  // Periodic focus check — refocus if popup steals window focus
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hasFocus()) {
        window.focus()
      }
    }, 300)
    return () => clearInterval(interval)
  }, [])

  return (
    /* Outer container clips the iframe — hides any scrollbar */
    <div className="absolute inset-0 bg-black overflow-hidden">
      <iframe
        key={mode} // Force re-mount when switching modes
        ref={iframeRef}
        src={currentUrl}
        className="absolute inset-0 w-full h-full border-0"
        style={{
          overflow: 'hidden',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
        scrolling="no"
        // No sandbox — many streaming embeds detect sandbox restrictions and refuse to play.
        // Ad blocking is handled via parent-level window.open override + focus management.
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        // No referrerPolicy — use the default which sends the full Referer.
        // Many sites that allow embedding expect the full Referer header.
        onLoad={handleLoad}
        onError={handleError}
      />
      {/* Mode indicator — subtle, for debugging */}
      {mode === 'proxy' && (
        <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded bg-black/50 text-white/40 text-[9px] pointer-events-none">
          proxy
        </div>
      )}
    </div>
  )
}
