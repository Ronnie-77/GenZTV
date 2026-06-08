'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'

export interface QualityLevel {
  index: number
  width: number
  height: number
  bitrate: number
  label: string
}

export interface HlsStats {
  bandwidth: number
  bufferLength: number
  droppedFrames: number
  currentLevel: number
  autoLevelEnabled: boolean
}

export interface LiveStatus {
  isLive: boolean
  liveSyncPosition: number | null // The live edge position
  isBehindLive: boolean // Whether playback is behind live edge
}

interface HlsPlayerProps {
  src: string
  onReady?: () => void
  onError?: (error: string) => void
  onQualityLevels?: (levels: QualityLevel[]) => void
  onStatsUpdate?: (stats: HlsStats) => void
  onVideoRef?: (video: HTMLVideoElement | null) => void
  selectedQuality?: number // -1 = auto, 0+ = specific level index
  volume?: number
  muted?: boolean
  onLiveStatus?: (status: LiveStatus) => void
  seekToLive?: boolean // When true, seek to live edge
  onSeekedToLive?: () => void // Called after seeking to live
}

export function HlsPlayer({
  src,
  onReady,
  onError,
  onQualityLevels,
  onStatsUpdate,
  onVideoRef,
  selectedQuality = -1,
  volume = 1,
  muted = false,
  onLiveStatus,
  seekToLive,
  onSeekedToLive,
}: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const retryCountRef = useRef(0)
  const maxRetries = 5

  // Cleanup helper
  const cleanup = useCallback(() => {
    if (statsTimerRef.current) {
      clearInterval(statsTimerRef.current)
      statsTimerRef.current = null
    }
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    // Pass video ref to parent
    onVideoRef?.(video)

    // Cleanup previous instance
    cleanup()
    retryCountRef.current = 0

    // Check for native HLS support first (Safari, iOS)
    const nativeHls = video.canPlayType('application/vnd.apple.mpegurl')

    if (Hls.isSupported()) {
      // Use hls.js for Chrome, Firefox, Edge, etc.
      const hls = new Hls({
        // Performance tuning
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,

        // Buffer management
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 60 * 1000000, // 60MB
        maxBufferHole: 0.5,

        // ABR (Adaptive Bitrate) settings
        abrEwmaDefaultEstimate: 500000, // Start with 500kbps estimate
        abrBandWidthFactor: 0.95,
        abrBandWidthUpFactor: 0.7,
        abrMaxWithRealBitrate: true,

        // Live stream optimization
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 6,
        liveDurationInfinity: true,
        progressive: true,

        // Error recovery
        fragLoadingMaxRetry: 6,
        fragLoadingMaxRetryTimeout: 64000,
        manifestLoadingMaxRetry: 4,
        manifestLoadingMaxRetryTimeout: 32000,
        levelLoadingMaxRetry: 4,
        levelLoadingMaxRetryTimeout: 32000,

        // Start from lowest quality for fast initial load
        startLevel: -1, // Auto
      })
      hlsRef.current = hls

      hls.loadSource(src)
      hls.attachMedia(video)

      // Manifest parsed — stream is ready
      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        // Build quality levels list
        const levels: QualityLevel[] = data.levels.map((level, index) => {
          const height = level.height || 0
          const bitrate = level.bitrate || 0
          let label = ''

          if (height >= 2160) label = '4K'
          else if (height >= 1440) label = '1440p'
          else if (height >= 1080) label = '1080p'
          else if (height >= 720) label = '720p'
          else if (height >= 480) label = '480p'
          else if (height >= 360) label = '360p'
          else if (height >= 240) label = '240p'
          else label = `${height}p`

          // Append bitrate info for labels
          if (bitrate > 0) {
            const mbps = (bitrate / 1000000).toFixed(1)
            label += ` · ${mbps}Mbps`
          }

          return {
            index,
            width: level.width || 0,
            height,
            bitrate,
            label,
          }
        })

        onQualityLevels?.(levels)
        onReady?.()
      })

      // Level switched — update current quality info
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        updateStats()
      })

      // Fragment loaded — update buffer stats
      hls.on(Hls.Events.FRAG_LOADED, () => {
        updateStats()
      })

      // Error handling with smart recovery
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          retryCountRef.current += 1

          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (retryCountRef.current <= maxRetries) {
                // Exponential backoff retry
                const delay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 16000)
                setTimeout(() => {
                  hls.startLoad()
                }, delay)
              } else {
                onError?.('Network error — stream unavailable after multiple retries')
                cleanup()
              }
              break

            case Hls.ErrorTypes.MEDIA_ERROR:
              if (retryCountRef.current <= 3) {
                hls.recoverMediaError()
              } else {
                // Try full recovery: destroy and recreate
                const currentTime = video.currentTime
                cleanup()
                // Re-initialize will happen via the useEffect
                video.currentTime = currentTime
                onError?.('Media error — attempting recovery')
              }
              break

            default:
              onError?.('Fatal stream error')
              cleanup()
              break
          }
        }
      })

      // Periodic stats update
      const updateStats = () => {
        if (!hlsRef.current) return
        const hlsInstance = hlsRef.current

        const buffered = video.buffered
        let bufferLength = 0
        if (buffered.length > 0) {
          bufferLength = buffered.end(buffered.length - 1) - video.currentTime
        }

        const stats: HlsStats = {
          bandwidth: hlsInstance.bandwidthEstimate || 0,
          bufferLength: Math.max(0, bufferLength),
          droppedFrames: (video as HTMLVideoElement & { getVideoPlaybackQuality?: () => { droppedVideoFrames?: number } }).getVideoPlaybackQuality?.()?.droppedVideoFrames || 0,
          currentLevel: hlsInstance.currentLevel,
          autoLevelEnabled: hlsInstance.autoLevelEnabled,
        }

        onStatsUpdate?.(stats)
      }

      statsTimerRef.current = setInterval(updateStats, 2000)

    } else if (nativeHls) {
      // Native HLS support (Safari, iOS) — no hls.js needed
      video.src = src

      // For native HLS, we can't get quality levels or ABR control
      // But playback will work natively with best performance
      const handleLoadedMetadata = () => {
        onReady?.()
        onQualityLevels?.([]) // Native HLS doesn't expose quality levels
        video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      }
      video.addEventListener('loadedmetadata', handleLoadedMetadata)

      const handleError = () => {
        onError?.('Native HLS playback error')
        video.removeEventListener('error', handleError)
      }
      video.addEventListener('error', handleError)

    } else {
      onError?.('HLS is not supported in this browser')
    }

    return () => {
      cleanup()
    }
  }, [src, cleanup, onReady, onError, onQualityLevels, onStatsUpdate, onVideoRef])

  // Handle quality level changes from parent
  useEffect(() => {
    if (!hlsRef.current) return
    const hls = hlsRef.current

    if (selectedQuality === -1) {
      // Auto mode — let hls.js decide
      hls.currentLevel = -1
    } else {
      hls.currentLevel = selectedQuality
    }
  }, [selectedQuality])

  // Apply volume and muted to video element
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = volume
    video.muted = muted
  }, [volume, muted])

  // Report live status periodically
  useEffect(() => {
    const checkLiveStatus = () => {
      const video = videoRef.current
      const hls = hlsRef.current
      if (!video || !hls) return

      const isLive = hls.liveSyncPosition !== undefined && hls.liveSyncPosition !== null
      const liveSyncPosition = hls.liveSyncPosition ?? null
      const isBehindLive = isLive && liveSyncPosition !== null && (liveSyncPosition - video.currentTime) > 3

      onLiveStatus?.({ isLive, liveSyncPosition, isBehindLive })
    }

    const timer = setInterval(checkLiveStatus, 1000)
    return () => clearInterval(timer)
  }, [onLiveStatus])

  // Handle seekToLive request
  useEffect(() => {
    if (!seekToLive) return
    const video = videoRef.current
    const hls = hlsRef.current
    if (!video || !hls) return

    const livePos = hls.liveSyncPosition
    if (livePos !== undefined && livePos !== null) {
      video.currentTime = livePos
      video.play().catch(() => {})
    }
    onSeekedToLive?.()
  }, [seekToLive, onSeekedToLive])

  return (
    <video
      ref={videoRef}
      className="w-full h-full"
      playsInline
      autoPlay
    />
  )
}
