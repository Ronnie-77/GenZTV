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

interface TsPlayerProps {
  src: string
  onReady?: () => void
  onError?: (error: string) => void
  onVideoRef?: (video: HTMLVideoElement | null) => void
  volume?: number
  muted?: boolean
  onBuffering?: (isBuffering: boolean) => void
}

export function TsPlayer({
  src,
  onReady,
  onError,
  onVideoRef,
  volume = 1,
  muted = false,
  onBuffering,
}: TsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<any>(null) // mpegts.Player type not available at import time

  const cleanup = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.pause()
      playerRef.current.unload()
      playerRef.current.detachMediaElement()
      playerRef.current.destroy()
      playerRef.current = null
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    onVideoRef?.(video)
    cleanup()

    let cancelled = false

    // Dynamically load mpegts.js (avoids SSR issues)
    loadMpegts().then((mpegtsLib) => {
      if (cancelled || !mpegtsLib) return

      // Check if mpegts.js is supported
      if (!mpegtsLib.isSupported()) {
        onError?.('MPEG-TS playback is not supported in this browser')
        return
      }

      const player = mpegtsLib.createPlayer({
        type: 'mpegts', // For .ts streams
        url: src,
        isLive: true,
      }, {
        // Live stream optimization
        liveBufferLatencyChasing: true,
        liveBufferLatencyChasingOnPaused: true,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 6,

        // Buffer management
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        bufferSize: 60 * 1000 * 1000, // 60MB

        // Auto cleanup
        autoCleanupSourceBuffer: true,
        autoCleanupMaxBackwardDuration: 30,
        autoCleanupMinBackwardDuration: 10,

        // Lazy load
        lazyLoad: true,
        lazyLoadMaxDuration: 180,
        lazyLoadRecoverDuration: 30,
      })

      player.attachMediaElement(video)
      player.loadSource(src)

      // Events
      player.on(mpegtsLib.Events.LOADING_COMPLETE, () => {
        // Stream loaded
      })

      player.on(mpegtsLib.Events.METADATA_ARRIVED, () => {
        onReady?.()
      })

      // Use video events for ready state as fallback
      const handleLoadedData = () => {
        onReady?.()
        video.removeEventListener('loadeddata', handleLoadedData)
      }
      video.addEventListener('loadeddata', handleLoadedData)

      const handlePlaying = () => {
        onReady?.()
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

      // Error handling
      player.on(mpegtsLib.Events.ERROR, (_event: string, data: { info?: string; reason?: string }) => {
        const errMsg = data?.info || data?.reason || 'MPEG-TS playback error'
        onError?.(errMsg)
      })

      const handleVideoError = () => {
        const err = video.error
        let msg = 'MPEG-TS playback error'
        if (err) {
          switch (err.code) {
            case MediaError.MEDIA_ERR_ABORTED: msg = 'Playback aborted'; break
            case MediaError.MEDIA_ERR_NETWORK: msg = 'Network error — stream unavailable'; break
            case MediaError.MEDIA_ERR_DECODE: msg = 'Decode error — stream format not supported'; break
            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: msg = 'Stream format not supported by browser'; break
          }
        }
        onError?.(msg)
      }
      video.addEventListener('error', handleVideoError)

      playerRef.current = player
    }).catch(() => {
      if (!cancelled) {
        onError?.('Failed to load MPEG-TS player')
      }
    })

    return () => {
      cancelled = true
      cleanup()
    }
  }, [src, cleanup, onReady, onError, onVideoRef, onBuffering])

  // Apply volume and muted
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = volume
    video.muted = muted
  }, [volume, muted])

  return (
    <video
      ref={videoRef}
      className="w-full h-full"
      playsInline
      autoPlay
    />
  )
}
