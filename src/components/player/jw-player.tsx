'use client'

import { useEffect, useRef, useCallback } from 'react'

interface JwPlayerProps {
  src: string          // The original m3u8 URL
  onReady?: () => void
  onError?: (error: string) => void
}

/**
 * JW-style HLS player — loads a self-contained HTML player page in an iframe.
 * The iframe page uses hls.js from CDN with more lenient settings and tries
 * the direct URL FIRST (opposite of the main HlsPlayer which tries proxy first).
 * This handles m3u8 streams that don't work through the proxy.
 */
export function JwPlayer({
  src,
  onReady,
  onError,
}: JwPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const readyFired = useRef(false)

  // Build the iframe URL pointing to our API route
  const iframeUrl = src
    ? `/api/jw-player?url=${encodeURIComponent(src)}`
    : ''

  // Listen for messages from the iframe (error notifications)
  const handleMessage = useCallback((event: MessageEvent) => {
    if (event.data?.type === 'jw-player-error') {
      onError?.(event.data.message || 'Stream playback error')
    }
    if (event.data?.type === 'jw-player-ready') {
      if (!readyFired.current) {
        readyFired.current = true
        onReady?.()
      }
    }
  }, [onReady, onError])

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  // Reset ready state when src changes
  useEffect(() => {
    readyFired.current = false
  }, [src])

  // Auto-notify ready after a short delay (iframe doesn't always post messages)
  useEffect(() => {
    if (!src) return
    const timer = setTimeout(() => {
      if (!readyFired.current) {
        readyFired.current = true
        onReady?.()
      }
    }, 3000)
    return () => clearTimeout(timer)
  }, [src, onReady])

  if (!iframeUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <p className="text-white/40 text-sm">No stream URL</p>
      </div>
    )
  }

  return (
    <iframe
      ref={iframeRef}
      src={iframeUrl}
      className="w-full h-full border-0"
      allow="autoplay; fullscreen; encrypted-media"
      allowFullScreen
      sandbox="allow-scripts allow-same-origin allow-popups"
      style={{ background: '#000' }}
    />
  )
}
