'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { HlsPlayer } from './hls-player'
import type { QualityLevel, HlsStats, LiveStatus } from './hls-player'
import { IframePlayer } from './iframe-player'
import { TsPlayer } from './ts-player'
import { PlayerControls } from './player-controls'
import { RotateCw, Lock, Unlock } from 'lucide-react'

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
    // Match .ts extension but NOT .m3u8 or playlist files
    return /\.ts(\?.*)?$/.test(pathname) && !pathname.includes('.m3u8')
  } catch {
    // If URL parsing fails, do a simple check
    return /\.ts(\?|$)/.test(url) && !url.includes('.m3u8')
  }
}

interface VideoPlayerProps {
  streamUrl: string
  streamType: string // m3u, iframe, github_m3u, direct, redirect
  title?: string
  isLive?: boolean
  poster?: string
  onStreamResolved?: (url: string) => void
}

// Extended screen orientation API type
type OrientationLockType = 'landscape' | 'portrait' | 'any' | 'natural' | 'landscape-primary' | 'landscape-secondary' | 'portrait-primary' | 'portrait-secondary'

interface ExtendedScreenOrientation extends ScreenOrientation {
  lock?(orientation: OrientationLockType): Promise<void>
  unlock(): void
}

interface ExtendedScreen extends Screen {
  orientation: ExtendedScreenOrientation
}

// Touch gesture state
interface TouchGesture {
  startX: number
  startY: number
  startTime: number
  isSwiping: boolean
  side: 'left' | 'right' | null
  currentBrightness: number
  startVolume: number
}

// Compute initial resolved URL & type synchronously to avoid flash of wrong URL
function getInitialResolved(url: string, type: string): { resolvedUrl: string; resolvedType: string } {
  if (!url) return { resolvedUrl: url, resolvedType: type }
  if (type === 'redirect') return { resolvedUrl: url, resolvedType: 'iframe' }
  if (type === 'github_m3u') return { resolvedUrl: url, resolvedType: type } // resolved async
  if (isTsUrl(url)) return { resolvedUrl: `/api/stream-proxy?url=${encodeURIComponent(url)}`, resolvedType: 'mpegts' }
  if (type === 'direct' || type === 'm3u' || type === 'm3u8') {
    return { resolvedUrl: `/api/stream-proxy?url=${encodeURIComponent(url)}`, resolvedType: type === 'direct' ? 'm3u' : type }
  }
  return { resolvedUrl: url, resolvedType: type }
}

export function VideoPlayer({
  streamUrl,
  streamType,
  title,
  isLive = true,
  poster,
  onStreamResolved,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // Compute initial state synchronously — prevents TsPlayer from briefly receiving the raw URL
  const initial = getInitialResolved(streamUrl, streamType)
  const [resolvedUrl, setResolvedUrl] = useState(initial.resolvedUrl)
  const [resolvedType, setResolvedType] = useState(initial.resolvedType)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [buffering, setBuffering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [controlsVisible, setControlsVisible] = useState(streamType === 'iframe' || streamType === 'mpegts' ? false : true)
  const [controlsBusy, setControlsBusy] = useState(false)
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Iframe touch overlay state — on mobile, a transparent overlay blocks ad clicks
  const [iframeTouchLocked, setIframeTouchLocked] = useState(true)
  const iframeUnlockTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Determine player type early (derived from state, needed by hooks below)
  const isIframe = resolvedType === 'iframe'
  const isMpegTs = resolvedType === 'mpegts'
  const isHls = resolvedType === 'm3u' || resolvedType === 'm3u8'

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

  // Auto-hide controls for iframe & mpegts after timeout
  useEffect(() => {
    if ((isIframe || isMpegTs) && controlsVisible && !controlsBusy) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      const isMobile = typeof window !== 'undefined' && 'ontouchstart' in window
      hideTimerRef.current = setTimeout(() => {
        setControlsVisible(false)
      }, isMobile ? 2500 : 3000)
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [isIframe, isMpegTs, controlsVisible, controlsBusy])

  // HLS quality & stats state
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([])
  const [currentQuality, setCurrentQuality] = useState(-1) // -1 = auto
  const [hlsStats, setHlsStats] = useState<HlsStats | null>(null)

  // Live status & Back to Live
  const [isBehindLive, setIsBehindLive] = useState(false)
  const [seekToLive, setSeekToLive] = useState(false)

  // Swipe gesture state
  const [gestureIndicator, setGestureIndicator] = useState<{
    type: 'volume' | 'brightness'
    value: number
    visible: boolean
  } | null>(null)
  const gestureRef = useRef<TouchGesture | null>(null)
  const gestureIndicatorTimer = useRef<NodeJS.Timeout | null>(null)
  const brightnessRef = useRef(1) // Track brightness in ref to avoid re-renders

  // ── Refs for gesture handlers (to avoid stale closures in native event listeners) ──
  const volumeRef = useRef(volume)
  volumeRef.current = volume
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const isIframeRef = useRef(isIframe)
  isIframeRef.current = isIframe

  // Resolve stream URLs — detect .ts files and apply CORS proxy
  useEffect(() => {
    async function resolve() {
      if (streamType === 'github_m3u' && streamUrl) {
        try {
          setLoading(true)
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
            // Detect if resolved URL is a .ts stream
            if (isTsUrl(channelUrl)) {
              setResolvedUrl(`/api/stream-proxy?url=${encodeURIComponent(channelUrl)}`)
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
        setResolvedType('iframe')
        setResolvedUrl(streamUrl)
      } else {
        // Detect .ts URLs for MPEG-TS player
        if (isTsUrl(streamUrl)) {
          setResolvedUrl(`/api/stream-proxy?url=${encodeURIComponent(streamUrl)}`)
          setResolvedType('mpegts')
        } else if (streamType === 'direct' || streamType === 'm3u' || streamType === 'm3u8') {
          // Use CORS proxy for HLS streams to bypass CORS
          setResolvedUrl(`/api/stream-proxy?url=${encodeURIComponent(streamUrl)}`)
          setResolvedType(streamType === 'direct' ? 'm3u' : streamType)
        } else {
          setResolvedUrl(streamUrl)
          setResolvedType(streamType)
        }
      }
    }
    resolve()
  }, [streamUrl, streamType, onStreamResolved])

  // Show controls with auto-hide timer
  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    const isMobile = typeof window !== 'undefined' && 'ontouchstart' in window
    const hideDelay = isIframe ? (isMobile ? 2500 : 3000) : 3000
    hideTimerRef.current = setTimeout(() => {
      if ((isIframe || playing) && !controlsBusy) setControlsVisible(false)
    }, hideDelay)
  }, [playing, controlsBusy, isIframe])

  const toggleControlsVisibility = useCallback(() => {
    if (controlsVisible) {
      setControlsVisible(false)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    } else {
      showControls()
    }
  }, [controlsVisible, showControls])

  const handleMouseMove = useCallback(() => {
    showControls()
  }, [showControls])

  // ── Native touch event listeners for HLS swipe gestures (passive: false to prevent scroll) ──
  // React's synthetic onTouchMove is passive by default — e.preventDefault() doesn't work.
  // We must use native DOM listeners with { passive: false }.
  useEffect(() => {
    const el = containerRef.current
    if (!el || isIframe) return

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      const rect = el.getBoundingClientRect()
      if (!rect) return

      const x = touch.clientX - rect.left
      const halfWidth = rect.width / 2
      const side = x < halfWidth ? 'left' : 'right'

      gestureRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
        isSwiping: false,
        side,
        currentBrightness: brightnessRef.current,
        startVolume: volumeRef.current,
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!gestureRef.current) return
      const touch = e.touches[0]
      const deltaY = gestureRef.current.startY - touch.clientY // Positive = swipe up
      const deltaX = Math.abs(touch.clientX - gestureRef.current.startX)

      // Only activate swipe if vertical movement is dominant
      if (!gestureRef.current.isSwiping) {
        if (Math.abs(deltaY) > 20 && Math.abs(deltaY) > deltaX) {
          gestureRef.current.isSwiping = true
        } else {
          return
        }
      }

      // ★ CRITICAL: Prevent page scroll while swiping — only works with passive:false
      e.preventDefault()

      const containerHeight = el.getBoundingClientRect().height || 400

      if (gestureRef.current.side === 'right') {
        // Right side = volume control
        const volumeChange = deltaY / containerHeight
        const finalVolume = Math.max(0, Math.min(1, gestureRef.current.startVolume + volumeChange * 1.5))

        setVolume(finalVolume)
        if (mutedRef.current && finalVolume > 0) setMuted(false)

        if (gestureIndicatorTimer.current) clearTimeout(gestureIndicatorTimer.current)
        setGestureIndicator({ type: 'volume', value: finalVolume, visible: true })
        gestureIndicatorTimer.current = setTimeout(() => {
          setGestureIndicator(null)
        }, 800)
      } else {
        // Left side = brightness control
        const brightnessChange = deltaY / containerHeight
        const newBrightness = Math.max(0.1, Math.min(1.5, gestureRef.current.currentBrightness + brightnessChange * 1.5))
        brightnessRef.current = newBrightness

        const videoEl = el.querySelector('video')
        if (videoEl) {
          videoEl.style.filter = `brightness(${newBrightness})`
        }

        if (gestureIndicatorTimer.current) clearTimeout(gestureIndicatorTimer.current)
        setGestureIndicator({ type: 'brightness', value: newBrightness, visible: true })
        gestureIndicatorTimer.current = setTimeout(() => {
          setGestureIndicator(null)
        }, 800)
      }
    }

    const handleTouchEnd = () => {
      gestureRef.current = null
    }

    // Register with passive:false so preventDefault() works
    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isIframe]) // Re-attach when player type changes

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        case 'f':
          e.preventDefault()
          toggleFullscreen()
          break
        case 'm':
          e.preventDefault()
          setMuted(m => !m)
          break
        case 'arrowup':
          e.preventDefault()
          setVolume(v => Math.min(1, v + 0.1))
          break
        case 'arrowdown':
          e.preventDefault()
          setVolume(v => Math.max(0, v - 0.1))
          break
        case 'escape':
          if (fullscreen) toggleFullscreen()
          break
        case 'q':
          e.preventDefault()
          if (qualityLevels.length > 0) {
            if (currentQuality === -1) {
              setCurrentQuality(0)
            } else {
              const nextIdx = currentQuality + 1
              if (nextIdx >= qualityLevels.length) {
                setCurrentQuality(-1)
              } else {
                setCurrentQuality(nextIdx)
              }
            }
          }
          break
      }
      showControls()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [fullscreen, showControls, qualityLevels, currentQuality])

  // Fullscreen change listener
  useEffect(() => {
    function handleFullscreenChange() {
      const isFullscreen = !!document.fullscreenElement
      setFullscreen(isFullscreen)
      if (!isFullscreen) {
        try {
          const screen = window.screen as ExtendedScreen
          screen.orientation.unlock?.()
        } catch {
          // Orientation unlock not supported
        }
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const togglePlay = useCallback(() => {
    const video = videoRef.current || containerRef.current?.querySelector('video')
    if (video) {
      if (video.paused) {
        video.play()
        setPlaying(true)
      } else {
        video.pause()
        setPlaying(false)
      }
    }
  }, [])

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return
    if (document.fullscreenElement) {
      try {
        const screen = window.screen as ExtendedScreen
        screen.orientation.unlock?.()
      } catch {
        // Orientation unlock not supported
      }
      document.exitFullscreen()
    } else {
      try {
        await containerRef.current.requestFullscreen()
        try {
          const screen = window.screen as ExtendedScreen
          if (screen.orientation?.lock) {
            await screen.orientation.lock('landscape')
          }
        } catch {
          // Orientation lock not supported (desktop browsers)
        }
      } catch {
        // Fullscreen request failed
      }
    }
  }, [])

  const togglePiP = useCallback(async () => {
    const video = videoRef.current || containerRef.current?.querySelector('video')
    if (!video) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else {
        await video.requestPictureInPicture()
      }
    } catch {
      // PiP not supported
    }
  }, [])

  const handleRetry = useCallback(() => {
    setError(null)
    setLoading(true)
    setBuffering(false)
    setQualityLevels([])
    setHlsStats(null)
    setCurrentQuality(-1)
    // Force player re-creation by toggling the URL
    const currentUrl = resolvedUrl
    setResolvedUrl('')
    requestAnimationFrame(() => {
      setResolvedUrl(currentUrl)
    })
  }, [resolvedUrl])

  const handleReady = useCallback(() => {
    setLoading(false)
    setBuffering(false)
    const video = videoRef.current || containerRef.current?.querySelector('video')
    if (video) {
      video.play().then(() => setPlaying(true)).catch(() => {})
    }
  }, [])

  const handleError = useCallback((err: string) => {
    setError(err)
    setLoading(false)
    setBuffering(false)
  }, [])

  const handleVideoRef = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video
  }, [])

  const handleQualityLevels = useCallback((levels: QualityLevel[]) => {
    setQualityLevels(levels)
  }, [])

  const handleStatsUpdate = useCallback((stats: HlsStats) => {
    setHlsStats(stats)
  }, [])

  const handleQualityChange = useCallback((level: number) => {
    setCurrentQuality(level)
  }, [])

  const handleLiveStatus = useCallback((status: LiveStatus) => {
    setIsBehindLive(status.isLive && status.isBehindLive)
  }, [])

  const handleBuffering = useCallback((isBuffering: boolean) => {
    setBuffering(isBuffering)
    if (!isBuffering) {
      const video = videoRef.current || containerRef.current?.querySelector('video')
      if (video && !video.paused) {
        setPlaying(true)
      }
    }
  }, [])

  const handleSeekedToLive = useCallback(() => {
    setSeekToLive(false)
    setPlaying(true)
  }, [])

  const handleBackToLive = useCallback(() => {
    setSeekToLive(true)
  }, [])

  // Check if device is mobile/touch
  const isMobileDevice = typeof window !== 'undefined' && 'ontouchstart' in window

  return (
    <div
      ref={containerRef}
      className={`relative bg-black overflow-hidden group ${
        fullscreen ? 'fixed inset-0 z-50 cursor-none' : 'rounded-none md:rounded-2xl'
      }`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        if (isIframe) {
          if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
          setControlsVisible(false)
        } else if (playing) {
          setControlsVisible(false)
        }
      }}
      onClick={() => {
        if (isIframe) {
          showControls()
        }
      }}
      onDoubleClick={(e) => { e.stopPropagation() }}
      onContextMenu={(e) => { if (isIframe) e.preventDefault() }}
      style={fullscreen ? {} : { aspectRatio: '16/9' }}
    >
      {/* Poster / placeholder */}
      {!resolvedUrl && !loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 to-black">
          <div className="text-center">
            <p className="text-white/50 text-sm">No stream URL configured</p>
          </div>
        </div>
      )}

      {/* HLS Player — Native with hls.js + ABR */}
      {isHls && resolvedUrl && (
        <div className="absolute inset-0">
          <HlsPlayer
            src={resolvedUrl}
            onReady={handleReady}
            onError={handleError}
            onQualityLevels={handleQualityLevels}
            onStatsUpdate={handleStatsUpdate}
            onVideoRef={handleVideoRef}
            selectedQuality={currentQuality}
            volume={volume}
            muted={muted}
            onLiveStatus={handleLiveStatus}
            seekToLive={seekToLive}
            onSeekedToLive={handleSeekedToLive}
            onBuffering={handleBuffering}
          />
        </div>
      )}

      {/* MPEG-TS Player — for raw .ts streams using mpegts.js */}
      {isMpegTs && resolvedUrl && (
        <div className="absolute inset-0">
          <TsPlayer
            src={resolvedUrl}
            onReady={handleReady}
            onError={handleError}
            onVideoRef={handleVideoRef}
            volume={volume}
            muted={muted}
            onBuffering={handleBuffering}
          />
        </div>
      )}

      {/* iFrame Player — for embed streams */}
      {isIframe && resolvedUrl && (
        <IframePlayer
          src={resolvedUrl}
          onReady={handleReady}
          onError={handleError}
        />
      )}

      {/* ── Mobile Iframe Touch Overlay ── */}
      {/* On mobile, a transparent overlay sits on top of the iframe to block ad clicks. */}
      {/* The user must tap the "Unlock" button to temporarily interact with the iframe. */}
      {isIframe && isMobileDevice && iframeTouchLocked && (
        <div
          className="absolute inset-0 z-[5] cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            showControls()
          }}
          onTouchStart={(e) => {
            // Block touch from reaching iframe
            e.stopPropagation()
          }}
        />
      )}

      {/* Gesture indicator overlay */}
      {gestureIndicator?.visible && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <div className="bg-black/70 backdrop-blur-sm rounded-2xl px-5 py-4 flex flex-col items-center gap-2 min-w-[100px]">
            {gestureIndicator.type === 'volume' ? (
              <>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  {gestureIndicator.value > 0 && (
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  )}
                  {gestureIndicator.value > 0.5 && (
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  )}
                  {gestureIndicator.value === 0 && (
                    <line x1="23" y1="9" x2="17" y2="15" />
                  )}
                </svg>
                <span className="text-white text-sm font-semibold">
                  {Math.round(gestureIndicator.value * 100)}%
                </span>
              </>
            ) : (
              <>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
                <span className="text-white text-sm font-semibold">
                  {Math.round(gestureIndicator.value * 100)}%
                </span>
              </>
            )}
            {/* Progress bar */}
            <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-100"
                style={{ width: `${Math.min(100, gestureIndicator.value * 100 / (gestureIndicator.type === 'brightness' ? 1.5 : 1))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Loading/buffering indicator removed — no spinner animation */}

      {/* Iframe reload hint — shows briefly for iframe mode */}
      {isIframe && !loading && !error && (
        <IframeReloadHint />
      )}

      {/* Controls overlay */}
      <PlayerControls
        isPlaying={playing}
        onTogglePlay={togglePlay}
        volume={volume}
        onVolumeChange={(vol: number) => { setVolume(vol); if (muted && vol > 0) setMuted(false) }}
        isMuted={muted}
        onToggleMute={() => setMuted(m => !m)}
        isFullscreen={fullscreen}
        onToggleFullscreen={toggleFullscreen}
        onTogglePiP={togglePiP}
        onToggleControlsVisibility={toggleControlsVisibility}
        title={title}
        isLive={isLive}
        isBehindLive={isHls && isBehindLive}
        onBackToLive={handleBackToLive}
        isLoading={loading}
        hasError={!!error}
        onRetry={handleRetry}
        visible={controlsVisible}
        onControlsBusy={setControlsBusy}
        qualityLevels={qualityLevels}
        currentQuality={currentQuality}
        onQualityChange={handleQualityChange}
        hlsStats={isHls ? hlsStats : null}
        isIframe={isIframe}
        iframeTouchLocked={isIframe && isMobileDevice && iframeTouchLocked}
        onToggleIframeTouchLock={() => setIframeTouchLocked(prev => !prev)}
      />

      {/* Fullscreen rotate hint — shows on mobile in portrait mode */}
      {fullscreen && (
        <div className="landscape-hint hidden absolute inset-0 z-20 bg-black/80 flex-col items-center justify-center gap-3 pointer-events-none">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="animate-spin" style={{ animationDuration: '3s' }}>
            <rect x="4" y="2" width="16" height="20" rx="2" />
            <line x1="12" y1="18" x2="12" y2="18.01" />
          </svg>
          <p className="text-white/80 text-sm font-medium">Rotate for fullscreen</p>
        </div>
      )}

      {/* Keyboard shortcut hint */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 opacity-0 pointer-events-none text-[10px] text-white/60 bg-black/50 px-2 py-1 rounded whitespace-nowrap">
        Space: Play/Pause • F: Fullscreen • M: Mute • Q: Quality
      </div>
    </div>
  )
}
