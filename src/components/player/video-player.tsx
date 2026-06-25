'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { IframePlayer } from './iframe-player'
import { IframeDirectPlayer } from './iframe-direct-player'
import { StreamPlayerWrapper } from './stream-player-wrapper'
import { PlayerControls } from './player-controls'
import { RotateCw } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// VideoPlayer — routes a stream to the right player backend.
//
// As of the v2 player migration, the HLS / HLS-Proxy / MPEG-TS backends are
// ALL served by the new production StreamPlayer (see stream-player-wrapper.tsx
// → public/stream-player.js). That player ships its own UI (controls, quality
// panel, live badge, spinner, error overlay, stall watchdog, CDN failover).
//
// Iframe streams still use the existing IframePlayer + PlayerControls combo,
// unchanged.
//
// Stream type → backend map:
//   m3u / m3u8 / m3u8_direct / m3u8_proxy → StreamPlayer (type: 'hls' / 'hls-proxy')
//   mpegts / *.ts                         → StreamPlayer (type: 'mpegts')
//   iframe / redirect                     → IframePlayer (unchanged)
//   github_m3u                            → resolved to a real URL, then StreamPlayer 'hls'
//   m3u8_jw                               → treated as 'hls' via StreamPlayer
// ─────────────────────────────────────────────────────────────────────────────

// Iframe reload hint — small floating button to reload iframe if video doesn't play
function IframeReloadHint() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 8000)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  const handleReload = () => {
    const iframe = document.querySelector('iframe')
    if (iframe) {
      const src = iframe.src
      iframe.src = ''
      setTimeout(() => { iframe.src = src }, 100)
    }
  }

  return (
    <button
      className="absolute top-2 right-2 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm hover:bg-black/80 transition-colors text-white/80 text-xs pointer-events-auto"
      onClick={handleReload}
    >
      <RotateCw className="h-3 w-3" />
      Tap if video doesn&apos;t load
    </button>
  )
}

// Detect raw MPEG-TS stream URLs (.ts extension, not inside m3u8)
function isTsUrl(url: string): boolean {
  if (!url) return false
  try {
    const pathname = new URL(url).pathname
    return /\.ts(\?.*)?$/.test(pathname) && !pathname.includes('.m3u8')
  } catch {
    return /\.ts(\?|$)/.test(url) && !url.includes('.m3u8')
  }
}

// Detect HLS manifest URLs (.m3u8 / .m3u)
function isM3u8Url(url: string): boolean {
  if (!url) return false
  try {
    const pathname = new URL(url).pathname
    return /\.m3u8?(\?.*)?$/.test(pathname)
  } catch {
    return /\.m3u8?(\?|$)/.test(url)
  }
}

// Auto-detect the stream type from the URL when no explicit streamType is given
// (or the given one is unknown). This is the client-side mirror of the same
// detection logic in /api/channels/import-file/route.ts — it guarantees that
// channels already stored in the DB without a streamType still route correctly.
function detectStreamTypeFromUrl(url: string): string | undefined {
  if (!url) return undefined
  if (isTsUrl(url)) return 'mpegts'
  if (isM3u8Url(url)) return 'm3u8'
  if (/(?:youtube\.com\/embed|youtu\.be|player\.twitch\.tv|player\.vimeo\.com|dailymotion\.com\/embed|facebook\.com\/plugins\/video|iframe\.|\/embed\/)/i.test(url)) {
    return 'iframe'
  }
  if (/github\.com\/.*\.m3u/i.test(url) || /raw\.githubusercontent\.com\/.*\.m3u/i.test(url)) {
    return 'github_m3u'
  }
  return undefined
}

interface VideoPlayerProps {
  streamUrl: string
  streamType: string // m3u, iframe, github_m3u, direct, redirect, m3u8_jw, m3u8_direct, m3u8_proxy, mpegts
  /** Channel ID — kept for API compatibility, unused by the new player. */
  channelId?: string
  /** Kept for API compatibility. The new StreamPlayer handles its own refresh internally. */
  onStreamUrlRefreshed?: (newUrl: string) => void
  title?: string
  isLive?: boolean
  poster?: string
  onStreamResolved?: (url: string) => void
}

// Route redirect URLs through our iframe proxy (used for 'redirect' type which always proxies)
function proxyIframeUrl(url: string): string {
  if (!url) return url
  return `/api/iframe-proxy?url=${encodeURIComponent(url)}`
}

// Route all streams through Next.js stream-proxy.
function proxyStreamUrl(url: string): string {
  if (!url) return url
  return `/api/stream-proxy?url=${encodeURIComponent(url)}`
}

// Known stream types. Anything outside this set is treated as "unknown" and
// triggers URL-based auto-detection below.
const KNOWN_STREAM_TYPES = new Set([
  'm3u', 'm3u8', 'm3u8_direct', 'm3u8_proxy', 'm3u8_jw',
  'iframe', 'iframe_direct', 'mpegts', 'github_m3u', 'direct', 'redirect',
])

// Compute the resolved URL + backend type synchronously to avoid a flash of wrong UI.
function getInitialResolved(url: string, type: string): { resolvedUrl: string; resolvedType: string } {
  if (!url) return { resolvedUrl: url, resolvedType: type }
  // Check for .ts URLs first — regardless of stored type.
  // A .ts file is never an iframe or m3u8 — it's a raw transport stream.
  if (type === 'mpegts' || isTsUrl(url)) return { resolvedUrl: url, resolvedType: 'mpegts' }

  // ── URL-based override for .m3u8 URLs ──
  // If the URL is an HLS manifest (.m3u8), it should NEVER render as iframe.
  // Some channels in the DB have streamType='iframe' or 'redirect' but the URL
  // is actually .m3u8 — this happens when JSON imports had wrong metadata.
  // The URL is the source of truth: override to 'm3u8' (plain HLS).
  // Exception: if the user explicitly chose an HLS sub-type (m3u8_direct,
  // m3u8_proxy, m3u8_jw), keep that — they chose proxy vs direct intentionally.
  if (isM3u8Url(url)) {
    if (type === 'm3u8_direct') return { resolvedUrl: url, resolvedType: 'm3u8_direct' }
    if (type === 'm3u8_proxy') return { resolvedUrl: url, resolvedType: 'm3u8_proxy' }
    if (type === 'm3u8_jw') return { resolvedUrl: url, resolvedType: 'm3u8_jw' }
    // For any other type (iframe, redirect, iframe_direct, mpegts, unknown, etc.)
    // with an .m3u8 URL, force plain HLS.
    return { resolvedUrl: url, resolvedType: 'm3u8' }
  }

  if (type === 'redirect') return { resolvedUrl: url, resolvedType: 'iframe' } // IframePlayer proxies it
  if (type === 'iframe') return { resolvedUrl: url, resolvedType: 'iframe' }
  // iframe_direct → raw iframe embed, no proxy/lock/controls
  if (type === 'iframe_direct') return { resolvedUrl: url, resolvedType: 'iframe_direct' }
  if (type === 'github_m3u') return { resolvedUrl: url, resolvedType: 'github_m3u' } // resolved async
  // HLS variants → all go to the new StreamPlayer
  if (type === 'm3u8_direct') return { resolvedUrl: url, resolvedType: 'm3u8_direct' }
  if (type === 'm3u8_proxy') return { resolvedUrl: url, resolvedType: 'm3u8_proxy' }
  if (type === 'm3u8_jw') return { resolvedUrl: url, resolvedType: 'm3u8_jw' }
  if (type === 'direct' || type === 'm3u' || type === 'm3u8') {
    return { resolvedUrl: url, resolvedType: type === 'direct' ? 'm3u' : type }
  }
  // ── Unknown / missing streamType → auto-detect from URL ──
  // This is the fix for the misclassification bugs:
  //   • .m3u8 URLs without a streamType were falling through to the default
  //     case and rendering as iframe (because no HLS handler matched).
  //   • .ts  URLs without a streamType were rendering as iframe too.
  if (!KNOWN_STREAM_TYPES.has(type)) {
    const detected = detectStreamTypeFromUrl(url)
    if (detected) return { resolvedUrl: url, resolvedType: detected }
  }
  return { resolvedUrl: url, resolvedType: type }
}

// Map the internal resolvedType to the StreamPlayer stream type.
//   'hls'        — plain HLS (direct from CDN)
//   'hls-proxy'  — HLS fetched through /api/stream-proxy (CORS/Referer bypass)
//   'mpegts'     — raw .ts transport stream (transmuxed via hls.js Blob M3U8)
function toStreamPlayerType(resolvedType: string): 'hls' | 'hls-proxy' | 'mpegts' {
  if (resolvedType === 'mpegts') return 'mpegts'
  // m3u8_proxy always routes through the Next.js stream-proxy.
  if (resolvedType === 'm3u8_proxy') return 'hls-proxy'
  // m3u8_direct, m3u, m3u8, m3u8_jw, github_m3u (after resolve) → plain HLS.
  // The StreamPlayer's own stall watchdog + CDN failover handles recovery.
  return 'hls'
}

export function VideoPlayer({
  streamUrl,
  streamType,
  channelId,
  onStreamUrlRefreshed,
  title,
  isLive = true,
  poster,
  onStreamResolved,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Compute initial state synchronously
  const initial = getInitialResolved(streamUrl, streamType)
  const [resolvedUrl, setResolvedUrl] = useState(initial.resolvedUrl)
  const [resolvedType, setResolvedType] = useState(initial.resolvedType)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)

  // Track fullscreen state changes (from double-click, keyboard, or browser)
  useEffect(() => {
    const handleFsChange = () => {
      setFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  // Iframe controls visibility (iframe-only — StreamPlayer & iframe_direct have their own controls)
  const [controlsVisible, setControlsVisible] = useState(streamType === 'iframe' || streamType === 'redirect' || streamType === 'iframe_direct' ? false : true)
  // On PC (desktop), iframe starts UNLOCKED so users can interact with the
  // embedded player directly (tap play, unmute, etc.). On mobile it starts
  // LOCKED to block ad clicks — the user taps "Unlock" to interact.
  const [iframeTouchLocked, setIframeTouchLocked] = useState(() => {
    if (typeof window === 'undefined') return true // SSR default
    const isMobile = 'ontouchstart' in window
    return isMobile // mobile = locked, desktop = unlocked
  })
  const iframeUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMobileDevice = typeof window !== 'undefined' && 'ontouchstart' in window

  const isIframe = resolvedType === 'iframe'
  // iframe_direct = raw iframe embed, no controls/lock/proxy
  const isIframeDirect = resolvedType === 'iframe_direct'

  // Auto-relock iframe after 10 seconds of being unlocked (prevents ongoing ad issues)
  useEffect(() => {
    if (isIframe && !iframeTouchLocked) {
      if (iframeUnlockTimerRef.current) clearTimeout(iframeUnlockTimerRef.current)
      iframeUnlockTimerRef.current = setTimeout(() => {
        setIframeTouchLocked(true)
      }, 10000)
    }
    return () => {
      if (iframeUnlockTimerRef.current) clearTimeout(iframeUnlockTimerRef.current)
    }
  }, [isIframe, iframeTouchLocked])

  // Auto-hide controls for iframe after timeout
  useEffect(() => {
    if (isIframe && controlsVisible) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      const isMobile = typeof window !== 'undefined' && 'ontouchstart' in window
      hideTimerRef.current = setTimeout(() => {
        setControlsVisible(false)
      }, isMobile ? 2500 : 3000)
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [isIframe, controlsVisible])

  // Resolve stream URLs — handle github_m3u async resolution + .ts detection.
  // Re-runs whenever the user switches stream (streamUrl/streamType change).
  useEffect(() => {
    async function resolve() {
      setError(null)
      setLoading(true)

      if (streamType === 'github_m3u' && streamUrl) {
        try {
          let url = streamUrl
          if (url.includes('github.com') && !url.includes('raw.githubusercontent.com')) {
            url = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/')
          }
          const res = await fetch('/api/m3u-parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
          })
          const data = await res.json()
          if (data.channels && data.channels.length > 0) {
            const channelUrl = data.channels[0].url
            if (isTsUrl(channelUrl)) {
              setResolvedUrl(channelUrl)
              setResolvedType('mpegts')
            } else {
              setResolvedUrl(channelUrl)
              setResolvedType('m3u')
            }
            onStreamResolved?.(channelUrl)
          } else {
            setError('No streams found in M3U file')
          }
        } catch {
          setError('Failed to parse M3U file')
        } finally {
          setLoading(false)
        }
      } else if (streamType === 'redirect' && streamUrl) {
        // redirect → iframe proxy, UNLESS the URL is .m3u8 or .ts (URL wins)
        if (isTsUrl(streamUrl)) {
          setResolvedUrl(streamUrl)
          setResolvedType('mpegts')
        } else if (isM3u8Url(streamUrl)) {
          setResolvedUrl(streamUrl)
          setResolvedType('m3u8')
        } else {
          setResolvedType('iframe')
          setResolvedUrl(streamUrl)
        }
        setLoading(false)
      } else {
        // All other types: use the same URL-based override logic as
        // getInitialResolved(). This guarantees .m3u8 URLs never render as
        // iframe and .ts URLs always use the mpegts player.
        const resolved = getInitialResolved(streamUrl, streamType)
        setResolvedUrl(resolved.resolvedUrl)
        setResolvedType(resolved.resolvedType)
        setLoading(false)
      }
    }
    resolve()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamUrl, streamType])

  // ── Iframe controls helpers (only used for iframe mode) ──
  const showControls = useCallback(() => {
    setControlsVisible(true)
  }, [])

  const toggleControlsVisibility = useCallback(() => {
    setControlsVisible((v) => !v)
  }, [])

  const toggleIframeTouchLock = useCallback(() => {
    setIframeTouchLocked((v) => !v)
  }, [])

  // ── StreamPlayer event handlers ──
  const handlePlayerReady = useCallback(() => {
    setLoading(false)
  }, [])

  const handlePlayerPlaying = useCallback(() => {
    setLoading(false)
    setError(null)
  }, [])

  const handlePlayerError = useCallback((message: string, _sub?: string) => {
    setError(message)
    setLoading(false)
  }, [])

  // Determine the final URL + type for the StreamPlayer.
  // For 'hls-proxy' we pass the proxyUrl so StreamPlayer rewrites every segment.
  // For 'mpegts' we also pass the proxyUrl so the .ts segment is fetched through
  // the proxy (raw .ts URLs are almost always CORS-blocked in the browser).
  // Plain 'hls' (direct) streams do NOT get a proxyUrl — they connect directly.
  const spType = toStreamPlayerType(resolvedType)
  const spUrl = resolvedUrl
  const spProxyUrl = (spType === 'hls-proxy' || spType === 'mpegts')
    ? '/api/stream-proxy?url='
    : undefined

  return (
    <div
      ref={containerRef}
      className={`relative bg-black overflow-hidden group ${
        fullscreen ? 'fixed inset-0 z-50' : 'rounded-none md:rounded-2xl'
      }`}
      style={fullscreen ? {} : { aspectRatio: '16/9' }}
      onMouseMove={() => { if (isIframe) showControls() }}
      onMouseLeave={() => { if (isIframe) setControlsVisible(false) }}
      onClick={() => { if (isIframe) showControls() }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        // Double-click toggles fullscreen for ALL player types
        const el = containerRef.current
        if (!el) return
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {})
        } else {
          el.requestFullscreen?.().catch(() => {})
        }
      }}
      onContextMenu={(e) => { if (isIframe || isIframeDirect) e.preventDefault() }}
    >
      {/* No stream configured */}
      {!resolvedUrl && !loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 to-black">
          <div className="text-center">
            <p className="text-white/50 text-sm">No stream URL configured</p>
          </div>
        </div>
      )}

      {/* Loading spinner — exact match of the website's loading screen spinner
          (page.tsx "Connecting to GenZ TV…" screen), only without the brand
          color. Same size (h-8 w-8), same border-b-2 style, neutral white. */}
      {loading && !error && resolvedUrl && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
        </div>
      )}

      {/* ── NEW: StreamPlayer for HLS / HLS-Proxy / MPEG-TS ── */}
      {/* The player ships its own controls, quality panel, live badge, spinner,
          error overlay, and stall watchdog. We don't render PlayerControls for
          these stream types. Title is NOT passed — the channel/match name is
          already shown in the watch page header above the player. */}
      {!isIframe && !isIframeDirect && resolvedUrl && !error && (
        <StreamPlayerWrapper
          src={spUrl}
          streamType={spType}
          proxyUrl={spProxyUrl}
          poster={poster}
          muted={false}
          autoplay={true}
          onReady={handlePlayerReady}
          onPlaying={handlePlayerPlaying}
          onError={handlePlayerError}
        />
      )}

      {/* ── Iframe Direct Player — raw iframe embed, NO controls/lock/proxy ── */}
      {/* The iframe content's own controls are used. Use for embedded players
          that already provide their own UI (YouTube Live, TV network embeds, etc.) */}
      {isIframeDirect && resolvedUrl && !error && (
        <IframeDirectPlayer
          src={resolvedUrl}
          title={title}
          onReady={() => setLoading(false)}
          onError={(e) => { setError(e); setLoading(false) }}
        />
      )}

      {/* ── Iframe Player — proxied iframe with controls/lock ── */}
      {isIframe && resolvedUrl && (
        <IframePlayer
          src={resolvedType === 'redirect' ? proxyIframeUrl(resolvedUrl) : resolvedUrl}
          originalUrl={streamUrl}
          onReady={() => setLoading(false)}
          onError={(e) => { setError(e); setLoading(false) }}
        />
      )}

      {/* Iframe reload hint */}
      {isIframe && !loading && !error && (
        <IframeReloadHint />
      )}

      {/* Iframe Touch/Click Overlay — blocks ad clicks until unlocked.
          Works on ALL devices (mobile + desktop). When locked, a transparent
          overlay sits on top of the iframe so clicks show controls instead of
          reaching the iframe's video. When unlocked, the overlay is removed so
          the user can interact with the iframe video directly. */}
      {isIframe && iframeTouchLocked && !loading && (
        <div
          className="absolute inset-0 z-[5] cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            showControls()
          }}
          onTouchStart={(e) => {
            e.stopPropagation()
          }}
        />
      )}

      {/* Iframe controls overlay — only for iframe mode.
          StreamPlayer has its own controls, so we don't render these for HLS/TS. */}
      {isIframe && (
        <PlayerControls
          isPlaying={false}
          onTogglePlay={() => {/* iframe controls its own playback */}}
          volume={1}
          onVolumeChange={() => {/* iframe volume not controllable */}}
          isMuted={false}
          onToggleMute={() => {}}
          isFullscreen={false}
          onToggleFullscreen={() => {
            const el = containerRef.current
            if (!el) return
            if (document.fullscreenElement) {
              document.exitFullscreen().catch(() => {})
            } else {
              el.requestFullscreen?.().catch(() => {})
            }
          }}
          onToggleControlsVisibility={toggleControlsVisibility}
          title={title}
          isLive={isLive}
          isLoading={loading}
          hasError={!!error}
          errorMessage={error || undefined}
          visible={controlsVisible}
          isIframe={true}
          iframeTouchLocked={iframeTouchLocked}
          onToggleIframeTouchLock={toggleIframeTouchLock}
        />
      )}

      {/* Error overlay (for non-iframe streams where StreamPlayer/iframe_direct failed to load) */}
      {error && !isIframe && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/90 p-6 text-center">
          <div className="text-white/60 text-sm font-medium">{error}</div>
          <button
            onClick={() => {
              setError(null)
              setLoading(true)
              // Force re-init by toggling the URL
              const u = resolvedUrl
              setResolvedUrl('')
              setTimeout(() => setResolvedUrl(u), 50)
            }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
