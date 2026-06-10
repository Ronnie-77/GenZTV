'use client'

import { useRef, useEffect } from 'react'

interface IframePlayerProps {
  src: string
  onReady?: () => void
  onError?: (error: string) => void
}

export function IframePlayer({ src, onReady, onError }: IframePlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

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

  // ── Popup / Ad Blocker ──
  // When iframe ads open new tabs, we detect the focus loss and
  // aggressively close those popups and refocus our window.
  useEffect(() => {
    // Store references to windows opened by our overridden window.open
    const openedWindows: Window[] = []

    // 1. Override window.open to intercept and auto-close popups
    const originalOpen = window.open
    window.open = function (...args) {
      // Open the window but immediately close it
      const newWin = originalOpen.apply(window, args)
      if (newWin) {
        try {
          newWin.close()
        } catch {
          // Cross-origin window, can't close
        }
      }
      // Return a mock window object so the caller doesn't crash
      return newWin || null
    }

    // 2. When our window loses focus (popup opened), aggressively refocus
    const handleBlur = () => {
      // Small delay to let the popup actually open
      setTimeout(() => {
        window.focus()
        // Try to close any opened windows
        openedWindows.forEach(w => {
          try { w.close() } catch { /* cross-origin */ }
        })
      }, 50)
    }

    // 3. When tab becomes hidden (user switched to popup tab), bring back
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Try to refocus immediately
        window.focus()
      }
    }

    // 4. Intercept beforeunload to prevent navigation away from our page
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // This will show a browser prompt - we prevent the navigation
      e.preventDefault()
      return ''
    }

    window.addEventListener('blur', handleBlur)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Cleanup
    return () => {
      window.open = originalOpen
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      // Close any remaining popup windows
      openedWindows.forEach(w => {
        try { w.close() } catch { /* cross-origin */ }
      })
    }
  }, [])

  return (
    <div className="relative w-full h-full bg-black">
      <iframe
        ref={iframeRef}
        src={url}
        className="w-full h-full border-0"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="no-referrer"
        onLoad={() => {
          onReady?.()
        }}
        onError={() => onError?.('Failed to load iframe')}
      />
    </div>
  )
}
