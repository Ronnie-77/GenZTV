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

export interface AudioTrack {
  id: number
  lang: string
  name: string
  default: boolean
}

export interface SubtitleTrack {
  id: number
  lang: string
  name: string
  default: boolean
}

interface HlsPlayerProps {
  src: string
  /** The original unproxied URL — used for direct load fallback */
  originalUrl?: string
  onReady?: () => void
  onError?: (error: string) => void
  onQualityLevels?: (levels: QualityLevel[]) => void
  onStatsUpdate?: (stats: HlsStats) => void
  onVideoRef?: (video: HTMLVideoElement | null) => void
  selectedQuality?: number // -1 = auto, 0+ = specific level index
  volume?: number
  muted?: boolean
  playbackRate?: number // Playback speed: 0.5, 0.75, 1, 1.25, 1.5, 2
  aspectMode?: 'fit' | 'stretch' | 'crop' | '16:9' | '4:3' // Video aspect ratio mode
  onLiveStatus?: (status: LiveStatus) => void
  seekToLive?: boolean // When true, seek to live edge
  onSeekedToLive?: () => void // Called after seeking to live
  onBuffering?: (isBuffering: boolean) => void // Called when video starts/stops buffering
  // Audio track selection
  selectedAudioTrack?: number // -1 = default, 0+ = specific track index
  onAudioTracks?: (tracks: AudioTrack[]) => void
  // Subtitle track selection
  selectedSubtitleTrack?: number // -1 = off, 0+ = specific track index
  onSubtitleTracks?: (tracks: SubtitleTrack[]) => void
}

export function HlsPlayer({
  src,
  originalUrl,
  onReady,
  onError,
  onQualityLevels,
  onStatsUpdate,
  onVideoRef,
  selectedQuality = -1,
  volume = 1,
  muted = false,
  playbackRate = 1,
  aspectMode = 'fit',
  onLiveStatus,
  seekToLive,
  onSeekedToLive,
  onBuffering,
  selectedAudioTrack = -1,
  onAudioTracks,
  selectedSubtitleTrack = -1,
  onSubtitleTracks,
}: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const retryCountRef = useRef(0)
  const maxRetries = 8
  // Track whether we've tried direct loading as fallback
  const triedDirectRef = useRef(false)

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

    // Buffering detection via video element events (works for both hls.js and native HLS)
    const handleWaiting = () => onBuffering?.(true)
    const handlePlaying = () => onBuffering?.(false)
    const handleCanPlay = () => onBuffering?.(false)
    video.addEventListener('waiting', handleWaiting)
    video.addEventListener('playing', handlePlaying)
    video.addEventListener('canplay', handleCanPlay)

    // Check for native HLS support first (Safari, iOS)
    const nativeHls = video.canPlayType('application/vnd.apple.mpegurl')

    if (Hls.isSupported()) {
      // Use hls.js for Chrome, Firefox, Edge, etc.
      const hls = new Hls({
        // Performance tuning
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,

        // Buffer management — generous for unreliable streams
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        maxBufferSize: 120 * 1000000, // 120MB
        maxBufferHole: 0.5,

        // ABR (Adaptive Bitrate) settings
        abrEwmaDefaultEstimate: 500000, // Start with 500kbps estimate
        abrBandWidthFactor: 0.95,
        abrBandWidthUpFactor: 0.7,
        abrMaxWithRealBitrate: true,

        // Live stream optimization
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        liveDurationInfinity: true,
        progressive: true,

        // Aggressive retry and timeout settings for unreliable servers
        fragLoadingMaxRetry: 10,
        fragLoadingMaxRetryTimeout: 64000,
        fragLoadingTimeOut: 60000, // 60s timeout for fragment loading
        manifestLoadingMaxRetry: 6,
        manifestLoadingMaxRetryTimeout: 32000,
        manifestLoadingTimeOut: 60000, // 60s timeout for manifest loading
        levelLoadingMaxRetry: 6,
        levelLoadingMaxRetryTimeout: 32000,
        levelLoadingTimeOut: 60000, // 60s timeout for level loading

        // Key loading retry — not all HLS.js versions support these
        // keyLoadingMaxRetry and keyLoadingMaxRetryTimeout are handled via fragLoading* settings

        // Start from lowest quality for fast initial load
        startLevel: -1, // Auto

        // XHR customization — set custom headers for each request
        xhrSetup: (xhr: XMLHttpRequest, url: string) => {
          // For proxied URLs, no special headers needed (proxy already handles them)
          // For direct URLs, add VLC-like headers for better server compatibility
          if (!url.includes('/api/stream-proxy')) {
            xhr.setRequestHeader('User-Agent', 'VLC/3.0.18 LibVLC/3.0.18')
          }
        },
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

        // Report initial audio tracks
        if (hls.audioTracks && hls.audioTracks.length > 0) {
          const audioTracks: AudioTrack[] = hls.audioTracks.map((t, i) => ({
            id: i,
            lang: t.lang || '',
            name: t.name || t.lang || `Track ${i + 1}`,
            default: t.default || false,
          }))
          onAudioTracks?.(audioTracks)
        }

        // Report initial subtitle tracks
        if (hls.subtitleTracks && hls.subtitleTracks.length > 0) {
          const subtitleTracks: SubtitleTrack[] = hls.subtitleTracks.map((t, i) => ({
            id: i,
            lang: t.lang || '',
            name: t.name || t.lang || `Subtitle ${i + 1}`,
            default: t.default || false,
          }))
          onSubtitleTracks?.(subtitleTracks)
        }

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

      // Audio tracks updated
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        if (!hlsRef.current) return
        const hlsInstance = hlsRef.current
        if (hlsInstance.audioTracks && hlsInstance.audioTracks.length > 0) {
          const audioTracks: AudioTrack[] = hlsInstance.audioTracks.map((t: { lang?: string; name?: string; default?: boolean }, i: number) => ({
            id: i,
            lang: t.lang || '',
            name: t.name || t.lang || `Track ${i + 1}`,
            default: t.default || false,
          }))
          onAudioTracks?.(audioTracks)
        }
      })

      // Subtitle tracks updated
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
        if (!hlsRef.current) return
        const hlsInstance = hlsRef.current
        if (hlsInstance.subtitleTracks && hlsInstance.subtitleTracks.length > 0) {
          const subtitleTracks: SubtitleTrack[] = hlsInstance.subtitleTracks.map((t: { lang?: string; name?: string; default?: boolean }, i: number) => ({
            id: i,
            lang: t.lang || '',
            name: t.name || t.lang || `Subtitle ${i + 1}`,
            default: t.default || false,
          }))
          onSubtitleTracks?.(subtitleTracks)
        }
      })

      // Error handling with smart recovery
      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error(`[hls-player] Error: type=${data.type}, details=${data.details}, fatal=${data.fatal}`, data)

        if (data.fatal) {
          retryCountRef.current += 1

          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (retryCountRef.current <= maxRetries) {
                // Exponential backoff retry
                const delay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 16000)
                console.log(`[hls-player] Network error retry ${retryCountRef.current}/${maxRetries} in ${delay}ms`)
                setTimeout(() => {
                  if (hlsRef.current) {
                    hls.startLoad()
                  }
                }, delay)
              } else if (!triedDirectRef.current && originalUrl) {
                // All proxy retries exhausted — try loading the URL directly
                console.log('[hls-player] Proxy failed, trying direct load fallback')
                triedDirectRef.current = true
                cleanup()
                // Set video src directly (bypass proxy)
                video.src = originalUrl
                video.play().catch(() => {})
                onReady?.()
              } else {
                onError?.('Network error — stream unavailable after multiple retries. Try refreshing.')
                cleanup()
              }
              break

            case Hls.ErrorTypes.MEDIA_ERROR:
              if (retryCountRef.current <= 4) {
                console.log(`[hls-player] Media error recovery attempt ${retryCountRef.current}`)
                hls.recoverMediaError()
              } else {
                // Try full recovery: destroy and recreate
                console.log('[hls-player] Full recovery attempt after media errors')
                const currentTime = video.currentTime
                cleanup()
                // Re-initialize will happen via the useEffect
                video.currentTime = currentTime
                onError?.('Media error — attempting recovery')
              }
              break

            default:
              onError?.('Fatal stream error — try a different channel')
              cleanup()
              break
          }
        } else {
          // Non-fatal errors — log but don't interrupt playback
          console.warn(`[hls-player] Non-fatal error: ${data.details}`)
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
      video.removeEventListener('waiting', handleWaiting)
      video.removeEventListener('playing', handlePlaying)
      video.removeEventListener('canplay', handleCanPlay)
      cleanup()
    }
  }, [src, cleanup, onReady, onError, onQualityLevels, onStatsUpdate, onVideoRef, onBuffering, originalUrl, onAudioTracks, onSubtitleTracks])

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

  // Handle audio track changes from parent
  useEffect(() => {
    if (!hlsRef.current) return
    const hls = hlsRef.current
    if (selectedAudioTrack >= 0 && hls.audioTracks && hls.audioTracks.length > 0) {
      hls.audioTrack = selectedAudioTrack
    }
  }, [selectedAudioTrack])

  // Handle subtitle track changes from parent
  useEffect(() => {
    if (!hlsRef.current) return
    const hls = hlsRef.current
    if (selectedSubtitleTrack >= 0) {
      hls.subtitleTrack = selectedSubtitleTrack
    } else {
      hls.subtitleTrack = -1
    }
  }, [selectedSubtitleTrack])

  // Apply volume, muted, and playback rate to video element
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = volume
    video.muted = muted
    video.playbackRate = playbackRate
  }, [volume, muted, playbackRate])

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

  // Compute video style based on aspect mode
  const videoStyle: React.CSSProperties = (() => {
    switch (aspectMode) {
      case 'stretch':
        return { objectFit: 'fill' } // Stretch to fill container
      case 'crop':
        return { objectFit: 'cover' } // Crop to fill, maintain aspect
      case '16:9':
        return { objectFit: 'contain', aspectRatio: '16/9' }
      case '4:3':
        return { objectFit: 'contain', aspectRatio: '4/3' }
      case 'fit':
      default:
        return { objectFit: 'contain' } // Default: fit within container
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
