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

      const player = mpegtsLib.createPlayer({
        type: streamType, // 'mpegts' for .ts streams, 'hls' for m3u8 streams
        url: src,
        isLive: true,
        cors: true,
      }, {
        // Live stream optimization
        liveBufferLatencyChasing: true,
        liveBufferLatencyChasingOnPaused: true,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 6,

        // Buffer management — keep buffers small for live streams
        maxBufferLength: 10,
        maxMaxBufferLength: 30,
        bufferSize: 30 * 1000 * 1000, // 30MB

        // Auto cleanup
        autoCleanupSourceBuffer: true,
        autoCleanupMaxBackwardDuration: 15,
        autoCleanupMinBackwardDuration: 5,

        // Lazy load
        lazyLoad: true,
        lazyLoadMaxDuration: 60,
        lazyLoadRecoverDuration: 30,

        // Enable stash buffer for smoother playback
        enableStashBuffer: true,
        stashInitialSize: 1024 * 256, // 256KB initial stash (smaller for live)

        // Auto reconnection for live streams
        liveStreamInfinity: true,

        // Deinterlace
        ...(deinterlace ? { deinterlace: true } : {}),

        // For HLS streams, add custom headers via XHR
        ...(streamType === 'hls' ? {
          // Custom loader for adding headers to HLS requests
          customSeekHandler: undefined,
        } : {}),
      })

      player.attachMediaElement(video)
      player.load()

      // Events
      player.on(mpegtsLib.Events.LOADING_COMPLETE, () => {
        // Stream loaded (VOD only, not for live)
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
