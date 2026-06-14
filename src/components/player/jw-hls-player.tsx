'use client'

import { useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'

interface JwHlsPlayerProps {
  src: string               // The original m3u8 URL (direct)
  proxySrc: string           // The proxied URL (/api/stream-proxy?url=...)
  onReady?: () => void
  onError?: (error: string) => void
  onVideoRef?: (video: HTMLVideoElement | null) => void
  volume?: number
  muted?: boolean
  playbackRate?: number
  aspectMode?: 'fit' | 'stretch' | 'crop' | '16:9' | '4:3'
  onBuffering?: (isBuffering: boolean) => void
}

/**
 * JW-style HLS Player for m3u8 streams that don't work with the regular HlsPlayer.
 *
 * STRATEGY (learned from user's working HTML file):
 * 1. Direct hls.js first — simplest config, no custom headers, no proxy
 *    This works when: IPTV server sends CORS headers, or page is HTTP
 * 2. Proxy hls.js fallback — uses server-side proxy to bypass CORS
 *    This works when: our server can reach the IPTV server
 * 3. Native HLS (Safari/iOS) — no CORS needed at all
 */

type PlayerMode = 'none' | 'native' | 'direct' | 'proxy'

export function JwHlsPlayer({
  src,
  proxySrc,
  onReady,
  onError,
  onVideoRef,
  volume = 1,
  muted = false,
  playbackRate = 1,
  aspectMode = 'fit',
  onBuffering,
}: JwHlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const readyFiredRef = useRef(false)
  const mediaErrorCountRef = useRef(0)
  const destroyedRef = useRef(false)
  const triedModesRef = useRef<Set<PlayerMode>>(new Set())

  const cb = useRef({ onReady, onError, onBuffering })
  useEffect(() => {
    cb.current = { onReady, onError, onBuffering }
  })

  const cleanup = useCallback(() => {
    destroyedRef.current = true
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
  }, [])

  function fireReady() {
    if (!readyFiredRef.current) {
      readyFiredRef.current = true
      cb.current.onReady?.()
    }
  }

  function finalError(msg: string) {
    console.error(`[jw-hls-player] FATAL: ${msg}`)
    cb.current.onError?.(msg)
    cleanup()
  }

  // ── Create a simple hls.js instance (like the user's working HTML) ──
  function createHls(url: string, mode: 'direct' | 'proxy'): Hls | null {
    if (!Hls.isSupported()) return null

    const isProxyMode = mode === 'proxy'

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
      maxBufferLength: 60,
      maxMaxBufferLength: 120,
      maxBufferSize: 120 * 1000000,
      maxBufferHole: 0.5,

      // ABR — start low, adapt up
      abrEwmaDefaultEstimate: 500000,
      abrBandWidthFactor: 0.95,
      abrBandWidthUpFactor: 0.7,
      abrMaxWithRealBitrate: true,

      // Live stream settings
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
      liveDurationInfinity: true,
      progressive: true,

      // Timeouts — generous for IPTV servers
      fragLoadingMaxRetry: isProxyMode ? 4 : 3,
      fragLoadingMaxRetryTimeout: 30000,
      fragLoadingTimeOut: 30000,

      manifestLoadingMaxRetry: isProxyMode ? 3 : 2,
      manifestLoadingMaxRetryTimeout: 30000,
      manifestLoadingTimeOut: isProxyMode ? 30000 : 15000,

      levelLoadingMaxRetry: isProxyMode ? 3 : 2,
      levelLoadingMaxRetryTimeout: 30000,
      levelLoadingTimeOut: isProxyMode ? 30000 : 15000,

      startLevel: -1,

      // CRITICAL: NO custom headers for direct mode (avoids CORS preflight)
      // Only add User-Agent for proxy mode (same-origin, no CORS issue)
      xhrSetup: (xhr: XMLHttpRequest, reqUrl: string) => {
        if (isProxyMode || reqUrl.includes('/api/stream-proxy')) {
          try { xhr.setRequestHeader('User-Agent', 'VLC/3.0.18 LibVLC/3.0.18') } catch {}
        }
        // Direct: NO custom headers = NO CORS preflight = better chance of success
      },
    })

    hls.loadSource(url)
    hls.attachMedia(videoRef.current!)

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log(`[jw-hls-player] Manifest parsed (${mode} mode) ✅`)
      fireReady()
      videoRef.current?.play().catch(() => {})
    })

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (destroyedRef.current) return
      const currentMode = triedModesRef.current.has('direct') ? 
        (triedModesRef.current.has('proxy') ? 'proxy' : 'direct') : 'none'
      console.error(`[jw-hls-player] Error: type=${data.type}, details=${data.details}, fatal=${data.fatal}, currentAttempt=${mode}`)

      if (!data.fatal) return

      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        mediaErrorCountRef.current += 1
        if (mediaErrorCountRef.current <= 3) {
          console.log(`[jw-hls-player] Media error recovery ${mediaErrorCountRef.current}/3`)
          hls.recoverMediaError()
        } else {
          // Too many media errors — try next mode
          tryNextMode(mode)
        }
      } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        // Network error — try next mode
        tryNextMode(mode)
      } else {
        finalError('Stream error — try again later')
      }
    })

    return hls
  }

  // ── Try the next playback mode ──
  function tryNextMode(failedMode: PlayerMode) {
    if (destroyedRef.current && !triedModesRef.current.has(failedMode)) return

    console.log(`[jw-hls-player] Mode '${failedMode}' failed, trying next...`)

    // Destroy current hls instance but DON'T set destroyed flag
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    // Reset destroyed flag so next mode can start
    destroyedRef.current = false
    mediaErrorCountRef.current = 0

    // Determine next mode based on what hasn't been tried yet
    // Order: direct → proxy → native
    if (failedMode === 'direct' && !triedModesRef.current.has('proxy')) {
      startProxy()
    } else if (!triedModesRef.current.has('native')) {
      startNative()
    } else {
      // All modes tried — give up
      finalError('Stream unavailable — all playback methods failed. The server may be offline, geo-restricted, or blocking connections. Try opening the stream URL directly in a new browser tab.')
    }
  }

  // ── Start: Direct hls.js (like user's working HTML file) ──
  function startDirect() {
    if (destroyedRef.current) return
    if (triedModesRef.current.has('direct')) {
      tryNextMode('direct')
      return
    }
    triedModesRef.current.add('direct')

    if (!Hls.isSupported()) {
      console.log('[jw-hls-player] hls.js not supported, trying native')
      startNative()
      return
    }

    console.log('[jw-hls-player] Step 1: Direct hls.js (no proxy, no custom headers)')

    const hls = createHls(src, 'direct')
    if (hls) {
      hlsRef.current = hls
    } else {
      tryNextMode('direct')
    }
  }

  // ── Fallback: Proxy hls.js ──
  function startProxy() {
    if (destroyedRef.current) return
    if (triedModesRef.current.has('proxy')) {
      startNative()
      return
    }
    triedModesRef.current.add('proxy')

    if (!proxySrc) {
      console.log('[jw-hls-player] No proxy URL, trying native')
      startNative()
      return
    }

    if (!Hls.isSupported()) {
      console.log('[jw-hls-player] hls.js not supported, trying native')
      startNative()
      return
    }

    console.log('[jw-hls-player] Step 2: Proxy hls.js (server-side fetch)')

    const hls = createHls(proxySrc, 'proxy')
    if (hls) {
      hlsRef.current = hls
    } else {
      startNative()
    }
  }

  // ── Last resort: Native HLS (Safari/iOS) ──
  function startNative() {
    if (destroyedRef.current) return
    if (triedModesRef.current.has('native')) {
      finalError('Stream unavailable — all playback methods failed. Try opening the URL directly in a new browser tab.')
      return
    }
    triedModesRef.current.add('native')

    const video = videoRef.current
    if (!video) { finalError('No video element'); return }

    const nativeHls = video.canPlayType('application/vnd.apple.mpegurl')
    if (!nativeHls) {
      finalError('Stream unavailable — browser cannot play this format. Try Safari/iOS or open the URL directly in a new tab.')
      return
    }

    console.log('[jw-hls-player] Step 3: Native HLS (Safari/iOS)')

    video.src = src

    const handleLoadedMetadata = () => {
      console.log('[jw-hls-player] Native HLS working! ✅')
      fireReady()
      video.play().catch(() => {})
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('error', handleError)
      clearTimeout(nativeTimeout)
    }

    const handleError = () => {
      console.log('[jw-hls-player] Native HLS failed')
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('error', handleError)
      clearTimeout(nativeTimeout)
      video.removeAttribute('src')
      video.load()
      finalError('Stream unavailable — the server may be offline or geo-restricted. Try opening the URL directly in a new browser tab.')
    }

    const nativeTimeout = setTimeout(() => {
      console.log('[jw-hls-player] Native HLS timeout (10s)')
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('error', handleError)
      video.removeAttribute('src')
      video.load()
      finalError('Stream unavailable — connection timed out. The server may be slow or geo-restricted.')
    }, 10000)

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('error', handleError)
    video.play().catch(() => {})
  }

  // ── Main Effect ──
  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    onVideoRef?.(video)

    // Reset state
    cleanup()
    readyFiredRef.current = false
    mediaErrorCountRef.current = 0
    destroyedRef.current = false
    triedModesRef.current = new Set()

    // Buffering events
    const handleWaiting = () => onBuffering?.(true)
    const handlePlaying = () => { onBuffering?.(false); fireReady() }
    const handleCanPlay = () => onBuffering?.(false)
    video.addEventListener('waiting', handleWaiting)
    video.addEventListener('playing', handlePlaying)
    video.addEventListener('canplay', handleCanPlay)

    // ═══════════════════════════════════════════════════
    // START: Try Direct → Proxy → Native
    // ═══════════════════════════════════════════════════
    startDirect()

    return () => {
      video.removeEventListener('waiting', handleWaiting)
      video.removeEventListener('playing', handlePlaying)
      video.removeEventListener('canplay', handleCanPlay)
      cleanup()
    }
  }, [src, proxySrc])

  // Volume/muted/playbackRate
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.volume = volume
    v.muted = muted
    v.playbackRate = playbackRate
  }, [volume, muted, playbackRate])

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
