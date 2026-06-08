'use client'

import { useRef, useState } from 'react'

interface IframePlayerProps {
  src: string
  onReady?: () => void
  onError?: (error: string) => void
}

export function IframePlayer({ src, onReady, onError }: IframePlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loaded, setLoaded] = useState(false)

  // Extract URL from iframe HTML if full iframe tag is provided
  const getSrcUrl = (input: string): string => {
    // If it's a full iframe tag, extract src attribute
    const srcMatch = input.match(/src=["']([^"']+)["']/)
    if (srcMatch) return srcMatch[1]
    // If it's already a URL, return as-is
    if (input.startsWith('http') || input.startsWith('/')) return input
    return input
  }

  const url = getSrcUrl(src)

  return (
    <div className="relative w-full h-full bg-black">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={url}
        className="w-full h-full border-0"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-presentation allow-forms allow-popups"
        onLoad={() => {
          setLoaded(true)
          onReady?.()
        }}
        onError={() => onError?.('Failed to load iframe')}
      />
    </div>
  )
}
