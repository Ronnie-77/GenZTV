'use client'

import { useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'

export interface JwHlsLoadMode {
  mode: 'native' | 'direct' | 'proxy'
}

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
  onLoadModeChange?: (info: JwHlsLoadMode) => void
}

/**
 * JW-style HLS Player — tries DIRECT URL first (no proxy, no custom headers).
 *
 * This is the KEY difference from HlsPlayer:
 * - HlsPlayer: proxy first → direct fallback → mpegts fallback
 * - JwHlsPlayer: native HLS → direct (no custom headers) → proxy fallback
 *
 * Why this matters:
 * - Adding custom headers (like User-Agent: VLC) triggers CORS preflight (OPTIONS request)
 * - Most IPTV servers don't handle OPTIONS, causing the request to fail
 * - By NOT adding custom headers, hls.js makes a simple CORS request
 * - If the IPTV server allows CORS (most do), this works directly
 *
 * Also: Native HLS (Safari/iOS) is tried FIRST because it doesn't need CORS at all
 * — the <video> element can load cross-origin media natively.
 */
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
  onLoadModeChange,
}: JwHlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const triedDirectRef = useRef(false)
  const triedProxyRef = useRef(false)
  const triedNativeRef = useRef(false)
  const fatalErrorCountRef = useRef(0)
  const mediaErrorCountRef = useRef(0)
  const readyFiredRef = useRef(false)

  // Stable refs for callbacks
  const cb = useRef({ onReady, onError, onBuffering, onLoadModeChange })
  useEffect(() => {
    cb.current = { onReady, onError, onBuffering, onLoadModeChange }
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

  function fireReady() {
    if (!readyFiredRef.current) {
      readyFiredRef.current = true
      cb.current.onReady?.()
    }
  }

  function finalError(msg: string) {
    console.error(`[jw-hls-player] 💀 ${msg}`)
    cb.current.onError?.(msg)
    cleanup()
  }

  // ── Create hls.js instance — NO custom headers for direct mode ──
  function createHlsInstance(url: string, isDirect: boolean): Hls | null {
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

      // Lenient timeouts — IPTV servers can be slow
      fragLoadingMaxRetry: isDirect ? 3 : 4,
      fragLoadingMaxRetryTimeout: isDirect ? 20000 : 30000,
      fragLoadingTimeOut: isDirect ? 20000 : 30000,

      manifestLoadingMaxRetry: isDirect ? 2 : 3,
      manifestLoadingMaxRetryTimeout: isDirect ? 15000 : 30000,
      manifestLoadingTimeOut: isDirect ? 15000 : 30000,

      levelLoadingMaxRetry: isDirect ? 2 : 3,
      levelLoadingMaxRetryTimeout: isDirect ? 15000 : 30000,
      levelLoadingTimeOut: isDirect ? 15000 : 30000,

      startLevel: -1,

      // CRITICAL: NO custom headers for direct requests!
      // Custom headers (like User-Agent: VLC) trigger CORS preflight
      // which most IPTV servers can't handle.
      // Only add User-Agent for proxy requests (same-origin, no CORS)
      xhrSetup: (xhr: XMLHttpRequest, reqUrl: string) => {
        if (reqUrl.includes('/api/stream-proxy')) {
          try { xhr.setRequestHeader('User-Agent', 'VLC/3.0.18 LibVLC/3.0.18') } catch {}
        }
        // For direct requests: NO custom headers = NO CORS preflight
      },
    })
  }

  // ── Initialize hls.js with URL ──
  function initHls(url: string, isDirect: boolean): Hls | null {
    const hls = createHlsInstance(url, isDirect)
    if (!hls) return null

    hls.loadSource(url)
    hls.attachMedia(videoRef.current!)

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log(`[jw-hls-player] ✅ Manifest parsed (${isDirect ? 'direct' : 'proxy'})`)
      fireReady()
    })

    hls.on(Hls.Events.ERROR, (_event, data) => {
      console.error(`[jw-hls-player] ❌ Error: type=${data.type}, details=${data.details}, fatal=${data.fatal}`)

      if (!data.fatal) return

      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        handleFatalNetworkError(isDirect)
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        handleFatalMediaError(hls, isDirect)
      } else {
        finalError('Fatal stream error')
      }
    })

    return hls
  }

  // ── Handle fatal network error with fallback ──
  function handleFatalNetworkError(wasDirect: boolean) {
    fatalErrorCountRef.current += 1

    if (wasDirect && !triedProxyRef.current && proxySrc) {
      // Direct failed → try proxy
      console.log('[jw-hls-player] 🔄 Direct failed → trying proxy')
      triedProxyRef.current = true
      cb.current.onLoadModeChange?.({ mode: 'proxy' })
      fatalErrorCountRef.current = 0
      mediaErrorCountRef.current = 0

      cleanup()
      const proxyHls = initHls(proxySrc, false)
      if (proxyHls) {
        hlsRef.current = proxyHls
      } else {
        finalError('Could not create proxy player')
      }
    } else if (!wasDirect && !triedDirectRef.current && src) {
      // Proxy failed → try direct
      console.log('[jw-hls-player] 🔄 Proxy failed → trying direct')
      triedDirectRef.current = true
      cb.current.onLoadModeChange?.({ mode: 'direct' })
      fatalErrorCountRef.current = 0
      mediaErrorCountRef.current = 0

      cleanup()
      const directHls = initHls(src, true)
      if (directHls) {
        hlsRef.current = directHls
      } else {
        finalError('Could not create direct player')
      }
    } else {
      finalError('Stream unavailable — server may be offline or blocking connections')
    }
  }

  // ── Handle fatal media error ──
  function handleFatalMediaError(hls: Hls, isDirect: boolean) {
    mediaErrorCountRef.current += 1
    if (mediaErrorCountRef.current <= 3) {
      console.log(`[jw-hls-player] Media error recovery ${mediaErrorCountRef.current}/3`)
      hls.recoverMediaError()
    } else {
      // Recreate the player
      console.log('[jw-hls-player] Media error too many times, recreating player')
      const url = isDirect ? src : proxySrc
      cleanup()
      mediaErrorCountRef.current = 0
      const newHls = initHls(url, isDirect)
      if (newHls) {
        hlsRef.current = newHls
      } else {
        finalError('Media error — stream format not supported')
      }
    }
  }

  // ── Main Effect: Initialize player ──
  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    onVideoRef?.(video)

    // Reset state
    cleanup()
    readyFiredRef.current = false
    fatalErrorCountRef.current = 0
    mediaErrorCountRef.current = 0
    triedDirectRef.current = false
    triedProxyRef.current = false
    triedNativeRef.current = false

    // Buffering events
    const handleWaiting = () => onBuffering?.(true)
    const handlePlaying = () => { onBuffering?.(false); fireReady() }
    const handleCanPlay = () => onBuffering?.(false)
    video.addEventListener('waiting', handleWaiting)
    video.addEventListener('playing', handlePlaying)
    video.addEventListener('canplay', handleCanPlay)

    // ═══════════════════════════════════════════════
    // STEP 1: Try Native HLS (Safari/iOS)
    // Native HLS does NOT need CORS — <video> can play cross-origin media
    // ═══════════════════════════════════════════════
    const nativeHls = video.canPlayType('application/vnd.apple.mpegurl')

    if (nativeHls) {
      console.log('[jw-hls-player] Step 1: Trying native HLS (Safari/iOS)')
      triedNativeRef.current = true
      cb.current.onLoadModeChange?.({ mode: 'native' })

      video.src = src

      const handleLoadedMetadata = () => {
        console.log('[jw-hls-player] ✅ Native HLS working!')
        fireReady()
        video.play().catch(() => {})
        video.removeEventListener('loadedmetadata', handleLoadedMetadata)
        video.removeEventListener('error', handleError)
        clearTimeout(nativeTimeout)
      }

      const handleError = () => {
        console.log('[jw-hls-player] Native HLS failed, trying hls.js direct')
        video.removeEventListener('loadedmetadata', handleLoadedMetadata)
        video.removeEventListener('error', handleError)
        clearTimeout(nativeTimeout)
        video.removeAttribute('src')
        video.load()
        tryDirectHls()
      }

      // Timeout for native HLS — if it doesn't fire loadedmetadata in 10s, move on
      const nativeTimeout = setTimeout(() => {
        console.log('[jw-hls-player] Native HLS timeout (10s), trying hls.js direct')
        video.removeEventListener('loadedmetadata', handleLoadedMetadata)
        video.removeEventListener('error', handleError)
        video.removeAttribute('src')
        video.load()
        tryDirectHls()
      }, 10000)

      video.addEventListener('loadedmetadata', handleLoadedMetadata)
      video.addEventListener('error', handleError)
      video.play().catch(() => {})

    } else if (Hls.isSupported()) {
      // ═══════════════════════════════════════════════
      // STEP 2: Try hls.js DIRECT (no proxy, no custom headers)
      // ═══════════════════════════════════════════════
      tryDirectHls()

    } else {
      cb.current.onError?.('HLS is not supported in this browser')
    }

    function tryDirectHls() {
      if (!src) return
      console.log('[jw-hls-player] Step 2: Trying hls.js direct (no custom headers)')
      triedDirectRef.current = true
      cb.current.onLoadModeChange?.({ mode: 'direct' })

      cleanup()
      const hls = initHls(src, true)
      if (hls) {
        hlsRef.current = hls
      } else {
        // hls.js not supported, try proxy as last resort
        tryProxyHls()
      }
    }

    function tryProxyHls() {
      if (!proxySrc) {
        finalError('Stream unavailable — no playback method available')
        return
      }
      console.log('[jw-hls-player] Step 3: Trying hls.js proxy')
      triedProxyRef.current = true
      cb.current.onLoadModeChange?.({ mode: 'proxy' })

      cleanup()
      const hls = initHls(proxySrc, false)
      if (hls) {
        hlsRef.current = hls
      } else {
        finalError('Could not create proxy player')
      }
    }

    return () => {
      video.removeEventListener('waiting', handleWaiting)
      video.removeEventListener('playing', handlePlaying)
      video.removeEventListener('canplay', handleCanPlay)
      cleanup()
    }
  }, [src, proxySrc, cleanup, onVideoRef, onBuffering])

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
