'use client'

// ─────────────────────────────────────────────────────────────────────────────
// StreamPlayerWrapper
//
// React wrapper around the uploaded StreamPlayer class
// (src/components/player/stream-player.ts → imported directly as a module).
// This is the new production player for M3U/HLS, M3U/HLS Proxy, and MPEG-TS
// (.ts) streams. The iframe player is unchanged.
//
// Why a wrapper instead of a from-scratch React player?
//   The uploaded player.js is a self-contained, production-tested class with
//   its own DOM, CSS, stall watchdog, CDN failover, and conservative ABR
//   tuning. Re-implementing that in React would risk regressions. Instead we
//   mount the class into a container div and bridge its events to React props.
//
// Buffer / reliability guarantees (configured in stream-player.ts HLS_CONFIG):
//   • Forward buffer  — maxBufferLength: 30s (loads 30s ahead)
//   • Stall watchdog  — 5s freeze → 3-stage auto-recovery (force-play → recoverMediaError → CDN rotate)
//   • Conservative ABR — abrBandWidthFactor 0.95, abrEwmaSlowLive 9.0 (drops quality before buffer)
//   • CDN failover    — pass streamUrls[] for auto-rotation on error
//
// Iframe streams (streamType 'iframe' / 'redirect') are NOT handled here —
// they continue to use the existing IframePlayer component.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react'
// Import the CSS so Turbopack bundles it with the component.
import './stream-player.css'
// Import the StreamPlayer class + SP_TYPE directly as ES modules.
import { StreamPlayer, SP_TYPE } from './stream-player'

// Re-export the stream type so the parent can reference it.
export type StreamPlayerType = 'hls' | 'hls-proxy' | 'mpegts'

interface StreamPlayerWrapperProps {
  /** The raw stream URL (already resolved by parent). */
  src: string
  /** Stream type — maps to StreamPlayer.TYPE. */
  streamType: StreamPlayerType
  /** Proxy prefix for 'hls-proxy' type, e.g. '/api/stream-proxy?url='. */
  proxyUrl?: string
  /** Optional poster image shown before playback starts. */
  poster?: string
  /** Stream title shown in the player's title badge. */
  title?: string
  /** Accent color (hex) — defaults to GenZ TV's primary red. */
  accentColor?: string
  /** Start muted (required for autoplay on most browsers). */
  muted?: boolean
  /** Auto-start playback on load. */
  autoplay?: boolean
  /** Called when the player fires its 'ready' event (first frame). */
  onReady?: () => void
  /** Called when playback starts. */
  onPlaying?: () => void
  /** Called when a stall is detected (retryCount is the argument). */
  onStalled?: (retryCount: number) => void
  /** Called on fatal error (message, sub). */
  onError?: (message: string, sub?: string) => void
  /** Called when quality levels are parsed from the manifest. */
  onLevelLoaded?: (levels: unknown[]) => void
  /** Called when the active quality changes. */
  onQualityChanged?: (levelIndex: number) => void
}

// Minimal type for the StreamPlayer instance we interact with.
interface StreamPlayerInstance {
  init(opts: { streamUrls?: string[]; streamType?: StreamPlayerType; proxyUrl?: string }): void
  play(): void
  pause(): void
  togglePlay(): void
  setVolume(v: number): void
  mute(): void
  toggleMute(): void
  setQuality(level: number): void
  goLive(): void
  toggleFullscreen(): void
  destroy(): void
  on(event: string, cb: (...args: unknown[]) => void): StreamPlayerInstance
  off(event: string, cb: (...args: unknown[]) => void): void
}

export function StreamPlayerWrapper({
  src,
  streamType,
  proxyUrl,
  poster,
  title,
  accentColor = '#e63946',
  muted = true,
  autoplay = true,
  onReady,
  onPlaying,
  onStalled,
  onError,
  onLevelLoaded,
  onQualityChanged,
}: StreamPlayerWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<StreamPlayerInstance | null>(null)
  // Keep latest callbacks in refs so we don't re-init the player on every render.
  const cbRef = useRef({ onReady, onPlaying, onStalled, onError, onLevelLoaded, onQualityChanged })
  cbRef.current = { onReady, onPlaying, onStalled, onError, onLevelLoaded, onQualityChanged }

  useEffect(() => {
    if (!containerRef.current) return

    let player: StreamPlayerInstance | null = null
    try {
      // Map our stream type to the SP_TYPE constant expected by StreamPlayer.
      const spType = streamType === 'hls-proxy'
        ? SP_TYPE.HLS_PROXY
        : streamType === 'mpegts'
          ? SP_TYPE.MPEGTS
          : SP_TYPE.HLS

      // Build options. streamUrls is an array — we pass a single URL here;
      // the player's CDN-failover support is available if multiple are passed.
      const opts = {
        streamUrls: [src],
        streamType: spType,
        proxyUrl: proxyUrl || '',
        autoplay,
        muted,
        poster: poster || '',
        title: title || '',
        showTitle: !!title,
        accentColor,
        debug: false,
      }

      // StreamPlayer is a class; cast through unknown to our minimal instance type.
      player = new StreamPlayer(containerRef.current, opts) as unknown as StreamPlayerInstance
      playerRef.current = player

      // Bridge events to React callbacks.
      player.on('ready', () => cbRef.current.onReady?.())
      player.on('playing', () => cbRef.current.onPlaying?.())
      player.on('stalled', (retryCount) => cbRef.current.onStalled?.(retryCount as number))
      player.on('error', (msg, sub) => {
        cbRef.current.onError?.(msg as string, sub as string | undefined)
      })
      player.on('levelLoaded', (levels) => cbRef.current.onLevelLoaded?.(levels as unknown[]))
      player.on('qualityChanged', (level) => cbRef.current.onQualityChanged?.(level as number))
    } catch (err) {
      console.error('[StreamPlayerWrapper] Failed to init player:', err)
      cbRef.current.onError?.('Player failed to initialize.', String(err))
    }

    return () => {
      if (player) {
        try {
          player.destroy()
        } catch {
          // ignore — player may already be destroyed
        }
      }
      playerRef.current = null
    }
    // Re-init only when the stream URL or type changes — NOT on every callback change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, streamType, proxyUrl, poster, title, accentColor, muted, autoplay])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full stream-player-host"
      // The StreamPlayer class builds its own DOM inside this container.
      // tabindex lets the player receive keyboard events (space/mute/fullscreen).
      tabIndex={0}
      role="region"
      aria-label="Video player"
    />
  )
}
