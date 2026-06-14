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
 * KEY DIFFERENCE from HlsPlayer:
 * - Much longer timeouts (30s manifest, 30s segments) — IPTV servers can be slow
 * - More retries (3 for manifest, 4 for segments)
 * - Proxy-first approach (required for HTTPS sites loading HTTP streams = mixed content)
 * - Direct fallback with NO custom headers (no CORS preflight)
 * - Native HLS as first attempt on Safari/iOS (no CORS needed at all)
 *
 * Why proxy-first?
 * - On HTTPS sites, browsers BLOCK HTTP requests (mixed content policy)
 * - Server-side proxy bypasses this because server → server has no mixed content restriction
 * - Direct mode only works if: site is HTTP, OR stream URL is HTTPS, OR browser allows it
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
}: JwHlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const triedProxyRef = useRef(false)
  const triedDirectRef = useRef(false)
  const mediaErrorCountRef = useRef(0)
  const readyFiredRef = useRef(false)

  const cb = useRef({ onReady, onError, onBuffering })
  useEffect(() => {
    cb.current = { onReady, onError, onBuffering }
  })

  const cleanup = useCallback(() => {
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

  // Check if direct mode is possible (not blocked by mixed content)
  function canTryDirect(): boolean {
    if (typeof window === 'undefined') return false
    // If page is HTTPS and stream URL is HTTP → mixed content blocks it
    if (window.location.protocol === 'https:' && src.startsWith('http://')) {
      console.log('[jw-hls-player] ⚠️ Skipping direct mode: HTTPS page + HTTP stream = mixed content block')
      return false
    }
    return true
  }

  // ── Create hls.js instance ──
  function createHlsInstance(url: string, isProxy: boolean): Hls | null {
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

      // VERY lenient timeouts — IPTV servers can be slow to respond
      fragLoadingMaxRetry: 4,
      fragLoadingMaxRetryTimeout: 30000,
      fragLoadingTimeOut: 30000,

      manifestLoadingMaxRetry: 3,
      manifestLoadingMaxRetryTimeout: 30000,
      manifestLoadingTimeOut: 30000,

      levelLoadingMaxRetry: 3,
      levelLoadingMaxRetryTimeout: 30000,
      levelLoadingTimeOut: 30000,

      startLevel: -1,

      // CRITICAL: Only set custom headers for proxy requests (same-origin)
      // For direct requests: NO custom headers = NO CORS preflight
      xhrSetup: (xhr: XMLHttpRequest, reqUrl: string) => {
        if (isProxy || reqUrl.includes('/api/stream-proxy')) {
          try { xhr.setRequestHeader('User-Agent', 'VLC/3.0.18 LibVLC/3.0.18') } catch {}
        }
        // Direct requests: no custom headers to avoid CORS preflight
      },
    })
  }

  // ── Initialize hls.js ──
  function initHls(url: string, isProxy: boolean): Hls | null {
    const hls = createHlsInstance(url, isProxy)
    if (!hls) return null

    hls.loadSource(url)
    hls.attachMedia(videoRef.current!)

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log(`[jw-hls-player] ✅ Manifest parsed (${isProxy ? 'proxy' : 'direct'})`)
      fireReady()
    })

    hls.on(Hls.Events.ERROR, (_event, data) => {
      console.error(`[jw-hls-player] ❌ Error: type=${data.type}, details=${data.details}, fatal=${data.fatal}`)

      if (!data.fatal) return

      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        handleFatalNetworkError(isProxy)
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        handleFatalMediaError(hls, isProxy)
      } else {
        finalError('Fatal stream error — try again later')
      }
    })

    return hls
  }

  // ── Handle fatal network error with fallback ──
  function handleFatalNetworkError(wasProxy: boolean) {
    if (wasProxy && !triedDirectRef.current && canTryDirect()) {
      // Proxy failed → try direct (only if not blocked by mixed content)
      console.log('[jw-hls-player] 🔄 Proxy failed → trying direct (no custom headers)')
      triedDirectRef.current = true
      mediaErrorCountRef.current = 0

      cleanup()
      const directHls = initHls(src, false)
      if (directHls) {
        hlsRef.current = directHls
      } else {
        finalError('Stream unavailable — could not connect to server')
      }
    } else if (!wasProxy && !triedProxyRef.current && proxySrc) {
      // Direct failed → try proxy
      console.log('[jw-hls-player] 🔄 Direct failed → trying proxy')
      triedProxyRef.current = true
      mediaErrorCountRef.current = 0

      cleanup()
      const proxyHls = initHls(proxySrc, true)
      if (proxyHls) {
        hlsRef.current = proxyHls
      } else {
        finalError('Stream unavailable — could not connect to server')
      }
    } else {
      finalError('Stream unavailable — the server may be offline or blocking connections. Try again later.')
    }
  }

  // ── Handle fatal media error ──
  function handleFatalMediaError(hls: Hls, isProxy: boolean) {
    mediaErrorCountRef.current += 1
    if (mediaErrorCountRef.current <= 3) {
      console.log(`[jw-hls-player] Media error recovery ${mediaErrorCountRef.current}/3`)
      hls.recoverMediaError()
    } else {
      const url = isProxy ? proxySrc : src
      cleanup()
      mediaErrorCountRef.current = 0
      const newHls = initHls(url, isProxy)
      if (newHls) {
        hlsRef.current = newHls
      } else {
        finalError('Media error — stream format not supported')
      }
    }
  }

  // ── Main Effect ──
  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    onVideoRef?.(video)

    cleanup()
    readyFiredRef.current = false
    mediaErrorCountRef.current = 0
    triedProxyRef.current = false
    triedDirectRef.current = false

    // Buffering events
    const handleWaiting = () => onBuffering?.(true)
    const handlePlaying = () => { onBuffering?.(false); fireReady() }
    const handleCanPlay = () => onBuffering?.(false)
    video.addEventListener('waiting', handleWaiting)
    video.addEventListener('playing', handlePlaying)
    video.addEventListener('canplay', handleCanPlay)

    const nativeHls = video.canPlayType('application/vnd.apple.mpegurl')

    if (nativeHls && canTryDirect()) {
      // ═══════════════════════════════════════════════
      // STEP 1: Native HLS (Safari/iOS)
      // Only on Safari where native HLS is available
      // AND not blocked by mixed content
      // ═══════════════════════════════════════════════
      console.log('[jw-hls-player] Step 1: Trying native HLS (Safari/iOS)')
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
        console.log('[jw-hls-player] Native HLS failed → trying proxy')
        video.removeEventListener('loadedmetadata', handleLoadedMetadata)
        video.removeEventListener('error', handleError)
        clearTimeout(nativeTimeout)
        video.removeAttribute('src')
        video.load()
        startWithProxy()
      }

      const nativeTimeout = setTimeout(() => {
        console.log('[jw-hls-player] Native HLS timeout (10s) → trying proxy')
        video.removeEventListener('loadedmetadata', handleLoadedMetadata)
        video.removeEventListener('error', handleError)
        video.removeAttribute('src')
        video.load()
        startWithProxy()
      }, 10000)

      video.addEventListener('loadedmetadata', handleLoadedMetadata)
      video.addEventListener('error', handleError)
      video.play().catch(() => {})

    } else {
      // ═══════════════════════════════════════════════
      // Non-Safari or mixed content: Start with PROXY
      // Proxy is the only reliable way from HTTPS sites
      // ═══════════════════════════════════════════════
      startWithProxy()
    }

    function startWithProxy() {
      if (!proxySrc) {
        // No proxy available — try direct as last resort
        if (Hls.isSupported() && src) {
          console.log('[jw-hls-player] No proxy, trying direct only')
          triedDirectRef.current = true
          const hls = initHls(src, false)
          if (hls) { hlsRef.current = hls } else { finalError('Cannot play this stream') }
        } else {
          finalError('Cannot play this stream — no proxy available')
        }
        return
      }

      if (!Hls.isSupported()) {
        finalError('HLS is not supported in this browser')
        return
      }

      console.log('[jw-hls-player] Starting with proxy (30s timeout)')
      triedProxyRef.current = true
      const hls = initHls(proxySrc, true)
      if (hls) {
        hlsRef.current = hls
      } else {
        finalError('Cannot create HLS player')
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
