'use client'

import { useRef } from 'react'

/**
 * IframeDirectPlayer
 * ─────────────────────────────────────────────────────────────
 * A minimal "raw" iframe player used for stream type `iframe_direct`.
 *
 * Unlike {@link IframePlayer}, this component:
 *   • Does NOT route the URL through `/api/iframe-proxy`.
 *   • Does NOT override `window.open`, intercept clicks/touches, or
 *     steal focus back from popunders.
 *   • Does NOT inject any ad-blocking / unmute script into the embed.
 *   • Does NOT strip X-Frame-Options (the embed page must already be
 *     iframe-friendly).
 *
 * It simply renders the iframe exactly as given, with full permissions,
 * so embeds that ship their own player UI (e.g.
 * `https://junkieembeds.pages.dev/embed/fox4k-usa`) work untouched.
 *
 * The parent {@link VideoPlayer} hides ALL of its own control overlays
 * (PlayerControls, IframeReloadHint, mobile touch-lock, loading spinner)
 * when this player is active — the embed is responsible for its own UI.
 */
interface IframeDirectPlayerProps {
  src: string
  onReady?: () => void
  onError?: (error: string) => void
}

export function IframeDirectPlayer({ src, onReady, onError }: IframeDirectPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // If the admin pasted a full <iframe src="..."> tag, pull the URL out.
  // Otherwise use the string as-is.
  const getSrcUrl = (input: string): string => {
    if (!input) return input
    const srcMatch = input.match(/src=["']([^"']+)["']/)
    if (srcMatch) return srcMatch[1]
    return input
  }

  const url = getSrcUrl(src)

  return (
    <div className="absolute inset-0 bg-black overflow-hidden">
      <iframe
        ref={iframeRef}
        src={url}
        className="absolute inset-0 w-full h-full border-0"
        style={{
          overflow: 'hidden',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
        // Permissive sandbox-free permissions — the embed controls everything.
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture; camera; microphone"
        allowFullScreen
        // Send origin referrer so embeds that validate the referrer chain work.
        referrerPolicy="no-referrer-when-downgrade"
        onLoad={() => onReady?.()}
        onError={() => onError?.('Failed to load iframe')}
      />
    </div>
  )
}
