'use client'

import { useEffect, useRef, useCallback } from 'react'

// mpegts.js uses `window` at import time — must be dynamically imported
let mpegts: typeof import('mpegts.js') | null = null

async function loadMpegts() {
  if (!mpegts) {
    const mod = await import('mpegts.js')
    mpegts = mod.default || mod
  }
  return mpegts
}

// Detect if a URL is an HLS/m3u8 stream
function isHlsUrl(url: string): boolean {
  if (!url) return false
  try {
    const pathname = new URL(url).pathname
    return pathname.includes('.m3u8') || pathname.includes('.m3u')
  } catch {
    return url.includes('.m3u8') || url.includes('.m3u')
  }
}

interface TsPlayerProps {
  src: string
  onReady?: () => void
  onError?: (error: string) => void
  onVideoRef?: (video: HTMLVideoElement | null) => void
  volume?: number
  muted?: boolean
  playbackRate?: number
  aspectMode?: 'fit' | 'stretch' | 'crop' | '16:9' | '4:3'
  onBuffering?: (isBuffering: boolean) => void
  deinterlace?: boolean
}

export function TsPlayer({
  src,
  onReady,
  onError,
  onVideoRef,
  volume = 1,
  muted = false,
  playbackRate = 1,
  aspectMode = 'fit',
  onBuffering,
  deinterlace = false,
}: TsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<any>(null) // mpegts.Player type not available at import time
  const readyFiredRef = useRef(false)

  const cleanup = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.pause()
        playerRef.current.unload()
        playerRef.current.detachMediaElement()
        playerRef.current.destroy()
      } catch {
        // Ignore cleanup errors
      }
      playerRef.current = null
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    onVideoRef?.(video)
    cleanup()
    readyFiredRef.current = false

    let cancelled = false
    let retryCount = 0
    const maxRetries = 5
    // Declare reconnectTimer at the effect scope so the cleanup return function
    // can clear it. (The .then() callback assigns to this variable.)
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    // Determine stream type based on URL
    const streamType = isHlsUrl(src) ? 'hls' : 'mpegts'
    console.log(`[TsPlayer] Loading stream as ${streamType}: ${src}`)

    // Startup timeout — if no video data after 25s, report error
    const startupTimer = setTimeout(() => {
      if (!cancelled && !readyFiredRef.current) {
        console.error(`[TsPlayer] Startup timeout — no video data received after 25s`)
        onError?.('Stream could not be loaded. The server may be offline or blocking connections.')
        cleanup()
      }
    }, 25000)

    // Dynamically load mpegts.js (avoids SSR issues)
    loadMpegts().then((mpegtsLib) => {
      if (cancelled || !mpegtsLib) return

      // Check if mpegts.js is supported
      if (!mpegtsLib.isSupported()) {
        onError?.('MPEG-TS playback is not supported in this browser')
        return
      }

      // Config aligned with sports-fire.lovable.app's proven-working setup.
      // Their exact config: { type, url, isLive, enableWorker, enableStashBuffer: false, stashInitialSize: 128 }
      // We add generous buffer settings for smoothness (no lazyLoad, no latency
      // chasing, 30s maxBufferLength) to eliminate the 3–4s stutter.
      // stashInitialSize bumped to 384 (was 128) for smoother initial playback —
      // tiny initial stash caused first-segment micro-stutter on slow links.
      const player = mpegtsLib.createPlayer({
        type: streamType, // 'mpegts' for .ts streams, 'hls' for m3u8 streams
        url: src,
        isLive: true,
        cors: true,
        // Offload TS demuxing to a Web Worker so the main thread stays free.
        enableWorker: true,
        // Match sports-fire: no stash buffer, tiny initial stash.
        enableStashBuffer: false,
        stashInitialSize: 384,
      }, {
        // --- Live latency management ---
        // DISABLE aggressive latency chasing — was the #1 cause of the
        // 3–4 second micro-stutter (player kept jumping forward to "catch up").
        liveBufferLatencyChasing: false,
        liveBufferLatencyChasingOnPaused: false,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,

        // --- Buffer management (generous for smoothness) ---
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        bufferSize: 60 * 1000 * 1000, // 60MB

        // --- Auto cleanup of old SourceBuffer segments ---
        autoCleanupSourceBuffer: true,
        autoCleanupMaxBackwardDuration: 30,
        autoCleanupMinBackwardDuration: 10,

        // --- NO lazy loading — causes periodic re-buffer cycles ---
        lazyLoad: false,

        // Stash buffer (also set on mediaDataSource above; set here too for
        // older mpegts.js versions that read it from config)
        enableStashBuffer: false,
        stashInitialSize: 384,

        // Fix audio/video timestamp gaps (common with flaky IPTV upstreams
        // that drop frames) — prevents gradual desync over long viewing.
        fixAudioTimestampGap: true,

        // Deinterlace
        ...(deinterlace ? { deinterlace: true } : {}),

        // For HLS streams
        ...(streamType === 'hls' ? {
          customSeekHandler: undefined,
        } : {}),
      })

      player.attachMediaElement(video)
      player.load()

      // --- Initial play attempt ---
      // The video element has autoPlay + playsInline. We also call play()
      // explicitly as a fallback. The VideoPlayer's onReady callback also
      // calls play(). If the browser blocks unmuted autoplay, the user can
      // click the play button in the controls.
      video.play().catch(() => {
        // Autoplay blocked — user must click play. This is expected on some
        // browsers when there was no recent user gesture.
      })

      // --- Auto-reconnect for live streams ---
      // Many IPTV upstream servers (e.g. rgkkw.live) close the HTTP connection
      // after ~60–90s. mpegts.js fires LOADING_COMPLETE when the stream ends.
      // For live streams we manually reload the player to re-fetch the stream,
      // creating a new connection to the upstream. Without this, the video
      // would freeze when the buffer runs dry after the connection closes.
      let reconnectCount = 0
      const MAX_RECONNECTS = 50  // ~enough for hours of viewing
      const scheduleReconnect = (reason: string) => {
        if (cancelled || reconnectCount >= MAX_RECONNECTS) return
        reconnectCount++
        const delay = Math.min(500 * reconnectCount, 3000) // 0.5s → 3s backoff
        console.log(`[TsPlayer] Auto-reconnect ${reconnectCount}/${MAX_RECONNECTS} in ${delay}ms (${reason})`)
        reconnectTimer = setTimeout(() => {
          if (cancelled || !playerRef.current) return
          try {
            // Unload + reload: creates a fresh fetch to the proxy/upstream
            playerRef.current.unload()
            playerRef.current.load()
            // Try to resume playback (browser may block unmuted autoplay, but
            // since the user already interacted with the page, it should work)
            playerRef.current.play().catch(() => {})
          } catch (e) {
            console.error('[TsPlayer] Reconnect failed:', e)
          }
        }, delay)
      }

      // Events
      player.on(mpegtsLib.Events.LOADING_COMPLETE, () => {
        // For live streams, the upstream connection ended. Auto-reconnect to
        // resume playback. (For VOD this means the video finished — don't reconnect.)
        if (streamType === 'mpegts' || streamType === 'hls') {
          scheduleReconnect('upstream connection ended (LOADING_COMPLETE)')
        }
      })

      player.on(mpegtsLib.Events.METADATA_ARRIVED, () => {
        if (!readyFiredRef.current) {
          readyFiredRef.current = true
          clearTimeout(startupTimer)
          onReady?.()
        }
      })

      // Use video events for ready state as fallback
      const handleLoadedData = () => {
        if (!readyFiredRef.current) {
          readyFiredRef.current = true
          clearTimeout(startupTimer)
          onReady?.()
        }
        video.removeEventListener('loadeddata', handleLoadedData)
      }
      video.addEventListener('loadeddata', handleLoadedData)

      const handlePlaying = () => {
        if (!readyFiredRef.current) {
          readyFiredRef.current = true
          onReady?.()
        }
        onBuffering?.(false)
      }
      video.addEventListener('playing', handlePlaying)

      const handleWaiting = () => {
        onBuffering?.(true)
      }
      video.addEventListener('waiting', handleWaiting)

      const handleCanPlay = () => {
        onBuffering?.(false)
      }
      video.addEventListener('canplay', handleCanPlay)

      // Error handling with auto-retry for network errors
      player.on(mpegtsLib.Events.ERROR, (_event: string, data: { info?: string; reason?: string; type?: string }) => {
        console.error('[TsPlayer] mpegts.js ERROR:', JSON.stringify(data))

        const errorType = data?.type
        const errMsg = data?.info || data?.reason || `${streamType.toUpperCase()} playback error`

        // Auto-retry for network/connection errors
        if ((errorType === 'NetworkError' || errMsg.includes('network') || errMsg.includes('Network') || errMsg.includes('Early-EOF') || errMsg.includes('timeout') || errMsg.includes('Interrupted')) && retryCount < maxRetries) {
          retryCount++
          console.log(`[TsPlayer] Auto-retry ${retryCount}/${maxRetries} after error: ${errMsg}`)
          const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 8000)
          setTimeout(() => {
            if (!cancelled && playerRef.current) {
              try {
                playerRef.current.unload()
                playerRef.current.load()
                playerRef.current.play()
              } catch {
                onError?.(errMsg)
              }
            }
          }, delay)
          return
        }

        onError?.(errMsg)
      })

      const handleVideoError = () => {
        const err = video.error
        let msg = `${streamType.toUpperCase()} playback error`
        if (err) {
          switch (err.code) {
            case MediaError.MEDIA_ERR_ABORTED: msg = 'Playback aborted'; break
            case MediaError.MEDIA_ERR_NETWORK: msg = 'Network error — stream unavailable'; break
            case MediaError.MEDIA_ERR_DECODE: msg = 'Decode error — stream format not supported'; break
            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: msg = 'Stream format not supported by browser'; break
          }
        }
        console.error('[TsPlayer] Video element error:', msg)
        onError?.(msg)
      }
      video.addEventListener('error', handleVideoError)

      playerRef.current = player
    }).catch((e) => {
      if (!cancelled) {
        console.error('[TsPlayer] Failed to load mpegts.js:', e)
        onError?.('Failed to load MPEG-TS player')
      }
    })

    return () => {
      cancelled = true
      clearTimeout(startupTimer)
      // Clear any pending reconnect timer so it doesn't fire after unmount
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      cleanup()
    }
  }, [src, cleanup, onReady, onError, onVideoRef, onBuffering])

  // Apply volume, muted, and playback rate
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = volume
    video.muted = muted
    video.playbackRate = playbackRate
  }, [volume, muted, playbackRate])

  // Compute video style based on aspect mode
  const videoStyle: React.CSSProperties = (() => {
    switch (aspectMode) {
      case 'stretch':
        return { objectFit: 'fill' }
      case 'crop':
        return { objectFit: 'cover' }
      case '16:9':
        return { objectFit: 'contain', aspectRatio: '16/9' }
      case '4:3':
        return { objectFit: 'contain', aspectRatio: '4/3' }
      case 'fit':
      default:
        return { objectFit: 'contain' }
    }
  })()

  return (
    <video
      ref={videoRef}
      className="w-full h-full"
      style={videoStyle}
      playsInline
      autoPlay
    />
  )
}
