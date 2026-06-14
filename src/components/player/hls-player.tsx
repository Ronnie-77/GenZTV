'use client'

import { useEffect, useRef, useCallback } from 'react'
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
  liveSyncPosition: number | null
  isBehindLive: boolean
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

export type LoadMode = 'proxy' | 'direct' | 'mpegts'

interface HlsPlayerProps {
  src: string
  originalUrl?: string
  onReady?: () => void
  onError?: (error: string) => void
  onQualityLevels?: (levels: QualityLevel[]) => void
  onStatsUpdate?: (stats: HlsStats) => void
  onVideoRef?: (video: HTMLVideoElement | null) => void
  selectedQuality?: number
  volume?: number
  muted?: boolean
  playbackRate?: number
  aspectMode?: 'fit' | 'stretch' | 'crop' | '16:9' | '4:3'
  onLiveStatus?: (status: LiveStatus) => void
  seekToLive?: boolean
  onSeekedToLive?: () => void
  onBuffering?: (isBuffering: boolean) => void
  selectedAudioTrack?: number
  onAudioTracks?: (tracks: AudioTrack[]) => void
  selectedSubtitleTrack?: number
  onSubtitleTracks?: (tracks: SubtitleTrack[]) => void
  onLoadModeChange?: (mode: LoadMode) => void
  onRequestMpegts?: () => void
}

function buildQualityLabel(height: number, bitrate: number): string {
  let label = ''
  if (height >= 2160) label = '4K'
  else if (height >= 1440) label = '1440p'
  else if (height >= 1080) label = '1080p'
  else if (height >= 720) label = '720p'
  else if (height >= 480) label = '480p'
  else if (height >= 360) label = '360p'
  else if (height >= 240) label = '240p'
  else label = `${height}p`

  if (bitrate > 0) {
    const mbps = (bitrate / 1000000).toFixed(1)
    label += ` · ${mbps}Mbps`
  }
  return label
}

function buildStats(hlsInstance: Hls, video: HTMLVideoElement): HlsStats {
  const buffered = video.buffered
  let bufferLength = 0
  if (buffered.length > 0) {
    bufferLength = buffered.end(buffered.length - 1) - video.currentTime
  }
  return {
    bandwidth: hlsInstance.bandwidthEstimate || 0,
    bufferLength: Math.max(0, bufferLength),
    droppedFrames: (video as HTMLVideoElement & { getVideoPlaybackQuality?: () => { droppedVideoFrames?: number } }).getVideoPlaybackQuality?.()?.droppedVideoFrames || 0,
    currentLevel: hlsInstance.currentLevel,
    autoLevelEnabled: hlsInstance.autoLevelEnabled,
  }
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
  onLoadModeChange,
  onRequestMpegts,
}: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const loadModeRef = useRef<LoadMode>('proxy')
  const triedDirectRef = useRef(false)
  const triedMpegtsRef = useRef(false)
  const fatalErrorCountRef = useRef(0)
  const mediaErrorCountRef = useRef(0)

  // Stable refs for callbacks
  const cb = useRef({
    onReady, onError, onQualityLevels, onStatsUpdate,
    onAudioTracks, onSubtitleTracks, onLoadModeChange, onRequestMpegts,
  })
  useEffect(() => {
    cb.current = {
      onReady, onError, onQualityLevels, onStatsUpdate,
      onAudioTracks, onSubtitleTracks, onLoadModeChange, onRequestMpegts,
    }
  })

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

  // Create HLS.js instance — proxy mode has very fast fail, direct mode has generous timeouts
  function createHls(url: string, video: HTMLVideoElement, isDirect: boolean): Hls | null {
    if (!Hls.isSupported()) return null

    return new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,

      maxBufferLength: 60,
      maxMaxBufferLength: 120,
      maxBufferSize: 120 * 1000000,
      maxBufferHole: 0.5,

      abrEwmaDefaultEstimate: 500000,
      abrBandWidthFactor: 0.95,
      abrBandWidthUpFactor: 0.7,
      abrMaxWithRealBitrate: true,

      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
      liveDurationInfinity: true,
      progressive: true,

      // KEY CHANGE: Proxy mode — fail fast (4s timeout, 0 retries for manifest)
      // This ensures we try direct mode quickly when the proxy can't reach the server
      // Direct mode — moderate timeouts (user's browser may reach the server directly)
      // Both modes should fail fast enough to try the next fallback within ~20s total
      fragLoadingMaxRetry: isDirect ? 2 : 1,
      fragLoadingMaxRetryTimeout: isDirect ? 12000 : 6000,
      fragLoadingTimeOut: isDirect ? 12000 : 6000,

      manifestLoadingMaxRetry: isDirect ? 1 : 0,  // 0 retries for proxy = fail on first timeout
      manifestLoadingMaxRetryTimeout: isDirect ? 6000 : 3000,
      manifestLoadingTimeOut: isDirect ? 8000 : 4000,  // 4s for proxy, 8s for direct

      levelLoadingMaxRetry: isDirect ? 1 : 0,
      levelLoadingMaxRetryTimeout: isDirect ? 6000 : 3000,
      levelLoadingTimeOut: isDirect ? 8000 : 4000,

      startLevel: -1,

      xhrSetup: (xhr: XMLHttpRequest, reqUrl: string) => {
        if (!reqUrl.includes('/api/stream-proxy')) {
          try { xhr.setRequestHeader('User-Agent', 'VLC/3.0.18 LibVLC/3.0.18') } catch {}
        }
      },
    })
  }

  // Initialize HLS with URL and attach all event handlers
  function initHls(url: string, video: HTMLVideoElement, isDirect: boolean): Hls | null {
    const hls = createHls(url, video, isDirect)
    if (!hls) return null

    hls.loadSource(url)
    hls.attachMedia(video)

    // ── Manifest Parsed ──
    hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
      console.log(`[hls-player] ✅ Manifest parsed (${loadModeRef.current}), ${data.levels.length} levels`)
      const levels: QualityLevel[] = data.levels.map((level, index) => ({
        index, width: level.width || 0, height: level.height || 0, bitrate: level.bitrate || 0,
        label: buildQualityLabel(level.height || 0, level.bitrate || 0),
      }))
      cb.current.onQualityLevels?.(levels)

      if (hls.audioTracks?.length > 0) {
        cb.current.onAudioTracks?.(hls.audioTracks.map((t, i) => ({
          id: i, lang: t.lang || '', name: t.name || t.lang || `Track ${i + 1}`, default: t.default || false,
        })))
      }
      if (hls.subtitleTracks?.length > 0) {
        cb.current.onSubtitleTracks?.(hls.subtitleTracks.map((t, i) => ({
          id: i, lang: t.lang || '', name: t.name || t.lang || `Subtitle ${i + 1}`, default: t.default || false,
        })))
      }

      cb.current.onReady?.()
    })

    // ── Stats Updates ──
    hls.on(Hls.Events.LEVEL_SWITCHED, () => { if (hlsRef.current) cb.current.onStatsUpdate?.(buildStats(hlsRef.current, video)) })
    hls.on(Hls.Events.FRAG_LOADED, () => { if (hlsRef.current) cb.current.onStatsUpdate?.(buildStats(hlsRef.current, video)) })

    // ── Track Updates ──
    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
      if (!hlsRef.current) return
      const inst = hlsRef.current
      if (inst.audioTracks?.length > 0) {
        cb.current.onAudioTracks?.(inst.audioTracks.map((t: { lang?: string; name?: string; default?: boolean }, i: number) => ({
          id: i, lang: t.lang || '', name: t.name || t.lang || `Track ${i + 1}`, default: t.default || false,
        })))
      }
    })
    hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
      if (!hlsRef.current) return
      const inst = hlsRef.current
      if (inst.subtitleTracks?.length > 0) {
        cb.current.onSubtitleTracks?.(inst.subtitleTracks.map((t: { lang?: string; name?: string; default?: boolean }, i: number) => ({
          id: i, lang: t.lang || '', name: t.name || t.lang || `Subtitle ${i + 1}`, default: t.default || false,
        })))
      }
    })

    // ── Error Handler with aggressive fallback ──
    hls.on(Hls.Events.ERROR, (_event, data) => {
      console.error(`[hls-player] ❌ Error: type=${data.type}, details=${data.details}, fatal=${data.fatal}, mode=${loadModeRef.current}`)

      if (!data.fatal) {
        console.warn(`[hls-player] Non-fatal: ${data.details}`)
        return
      }

      // Fatal error — take action
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        handleFatalNetworkError(video)
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        handleFatalMediaError(hls, video)
      } else {
        cb.current.onError?.('Fatal stream error — try a different channel')
        cleanup()
      }
    })

    return hls
  }

  // Handle fatal network errors with aggressive fallback
  function handleFatalNetworkError(video: HTMLVideoElement) {
    fatalErrorCountRef.current += 1
    const mode = loadModeRef.current

    if (mode === 'proxy') {
      // KEY: Switch to direct mode IMMEDIATELY on first fatal network error from proxy
      // Don't waste time with proxy retries — if the server can't reach the stream,
      // trying again won't help. The browser might be able to reach it directly.
      if (!triedDirectRef.current && originalUrl) {
        console.log('[hls-player] 🔄 Proxy failed → trying direct connection')
        triedDirectRef.current = true
        loadModeRef.current = 'direct'
        cb.current.onLoadModeChange?.('direct')
        fatalErrorCountRef.current = 0
        mediaErrorCountRef.current = 0

        // Destroy proxy HLS and create direct HLS
        cleanup()
        const directHls = initHls(originalUrl, video, true)
        if (directHls) {
          hlsRef.current = directHls
        } else {
          cb.current.onError?.('Failed to create direct HLS player')
        }
      } else if (!triedMpegtsRef.current && originalUrl) {
        // Skip direct if already tried, go to mpegts
        console.log('[hls-player] 🔄 Proxy failed → trying mpegts.js')
        switchToMpegts()
      } else {
        finalError('Server proxy failed and no fallback available')
      }
    } else if (mode === 'direct') {
      // In direct mode — switch to mpegts.js on first fatal error
      // (startLoad() doesn't work when HLS.js has exhausted its own retries)
      if (!triedMpegtsRef.current && originalUrl) {
        console.log('[hls-player] 🔄 Direct failed → trying mpegts.js')
        switchToMpegts()
      } else {
        finalError('Could not connect to stream server. It may be offline or blocking connections.')
      }
    } else {
      finalError('Network error — stream unavailable')
    }
  }

  // Handle fatal media errors
  function handleFatalMediaError(hls: Hls, video: HTMLVideoElement) {
    mediaErrorCountRef.current += 1
    if (mediaErrorCountRef.current <= 3) {
      console.log(`[hls-player] Media error recovery ${mediaErrorCountRef.current}/3`)
      hls.recoverMediaError()
    } else {
      // Try recreating the player
      const mode = loadModeRef.current
      console.log(`[hls-player] Media error too many times, recreating player (mode=${mode})`)
      const url = mode === 'direct' && originalUrl ? originalUrl : (hlsRef.current?.url || src)
      cleanup()
      mediaErrorCountRef.current = 0
      const newHls = initHls(url, video, mode === 'direct')
      if (newHls) {
        hlsRef.current = newHls
      } else {
        cb.current.onError?.('Media error — stream format not supported')
      }
    }
  }

  // Switch to mpegts.js mode
  function switchToMpegts() {
    triedMpegtsRef.current = true
    loadModeRef.current = 'mpegts'
    cb.current.onLoadModeChange?.('mpegts')
    cleanup()
    cb.current.onRequestMpegts?.()
  }

  // Show final error after all methods exhausted
  function finalError(msg: string) {
    console.error(`[hls-player] 💀 ${msg}`)
    cb.current.onError?.(msg)
    cleanup()
  }

  // ── Main Effect: Initialize player ──
  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    onVideoRef?.(video)

    // Reset state
    cleanup()
    fatalErrorCountRef.current = 0
    mediaErrorCountRef.current = 0
    triedDirectRef.current = false
    triedMpegtsRef.current = false
    loadModeRef.current = 'proxy'
    cb.current.onLoadModeChange?.('proxy')

    // Buffering events
    const handleWaiting = () => onBuffering?.(true)
    const handlePlaying = () => onBuffering?.(false)
    const handleCanPlay = () => onBuffering?.(false)
    video.addEventListener('waiting', handleWaiting)
    video.addEventListener('playing', handlePlaying)
    video.addEventListener('canplay', handleCanPlay)

    const nativeHls = video.canPlayType('application/vnd.apple.mpegurl')

    if (Hls.isSupported()) {
      // Start with proxy URL
      const hls = initHls(src, video, false)
      if (!hls) {
        cb.current.onError?.('HLS.js not supported')
        return () => { video.removeEventListener('waiting', handleWaiting); video.removeEventListener('playing', handlePlaying); video.removeEventListener('canplay', handleCanPlay); cleanup() }
      }
      hlsRef.current = hls

      // Stats timer
      statsTimerRef.current = setInterval(() => {
        if (!hlsRef.current) return
        cb.current.onStatsUpdate?.(buildStats(hlsRef.current, video))
      }, 2000)

    } else if (nativeHls) {
      // Safari/iOS native HLS
      video.src = src
      const handleLoadedMetadata = () => {
        cb.current.onReady?.()
        cb.current.onQualityLevels?.([])
        video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      }
      video.addEventListener('loadedmetadata', handleLoadedMetadata)
      const handleError = () => {
        if (originalUrl && video.src !== originalUrl) {
          console.log('[hls-player] Native HLS failed with proxy, trying direct')
          video.src = originalUrl
          video.play().catch(() => {})
        } else {
          cb.current.onError?.('Native HLS playback error')
        }
        video.removeEventListener('error', handleError)
      }
      video.addEventListener('error', handleError)
    } else {
      cb.current.onError?.('HLS is not supported in this browser')
    }

    return () => {
      video.removeEventListener('waiting', handleWaiting)
      video.removeEventListener('playing', handlePlaying)
      video.removeEventListener('canplay', handleCanPlay)
      cleanup()
    }
  }, [src, cleanup, onVideoRef, onBuffering, originalUrl])

  // Quality level changes
  useEffect(() => {
    if (!hlsRef.current) return
    hlsRef.current.currentLevel = selectedQuality === -1 ? -1 : selectedQuality
  }, [selectedQuality])

  // Audio track changes
  useEffect(() => {
    if (!hlsRef.current || selectedAudioTrack < 0) return
    if (hlsRef.current.audioTracks?.length > 0) hlsRef.current.audioTrack = selectedAudioTrack
  }, [selectedAudioTrack])

  // Subtitle track changes
  useEffect(() => {
    if (!hlsRef.current) return
    hlsRef.current.subtitleTrack = selectedSubtitleTrack >= 0 ? selectedSubtitleTrack : -1
  }, [selectedSubtitleTrack])

  // Volume/muted/playbackRate
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.volume = volume
    v.muted = muted
    v.playbackRate = playbackRate
  }, [volume, muted, playbackRate])

  // Live status
  useEffect(() => {
    const timer = setInterval(() => {
      const v = videoRef.current, h = hlsRef.current
      if (!v || !h) return
      const isLive = h.liveSyncPosition !== undefined && h.liveSyncPosition !== null
      const liveSyncPosition = h.liveSyncPosition ?? null
      const isBehindLive = isLive && liveSyncPosition !== null && (liveSyncPosition - v.currentTime) > 3
      onLiveStatus?.({ isLive, liveSyncPosition, isBehindLive })
    }, 1000)
    return () => clearInterval(timer)
  }, [onLiveStatus])

  // Seek to live
  useEffect(() => {
    if (!seekToLive) return
    const v = videoRef.current, h = hlsRef.current
    if (!v || !h) return
    const livePos = h.liveSyncPosition
    if (livePos !== undefined && livePos !== null) { v.currentTime = livePos; v.play().catch(() => {}) }
    onSeekedToLive?.()
  }, [seekToLive, onSeekedToLive])

  const videoStyle: React.CSSProperties = (() => {
    switch (aspectMode) {
      case 'stretch': return { objectFit: 'fill' }
      case 'crop': return { objectFit: 'cover' }
      case '16:9': return { objectFit: 'contain', aspectRatio: '16/9' }
      case '4:3': return { objectFit: 'contain', aspectRatio: '4/3' }
      default: return { objectFit: 'contain' }
    }
  })()

  return (
    <video ref={videoRef} className="w-full h-full" style={videoStyle} playsInline autoPlay />
  )
}
