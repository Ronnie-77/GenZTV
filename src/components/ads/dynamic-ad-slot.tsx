'use client'

import { useEffect, useRef, useCallback } from 'react'

/**
 * DynamicAdSlot — safely renders third-party ad scripts inside a sandboxed
 * <iframe srcdoc>.
 *
 * WHY AN IFRAME:
 * Ad networks (Adsterra, PropellerAds, HighPerformanceFormat, etc.) frequently
 * call document.write() to inject their creative. When document.write() runs
 * AFTER the page has finished loading (which is always the case for ads
 * injected via React), it implicitly calls document.open(), which WIPES the
 * entire document (the React app included) and leaves the document stream
 * open — the browser shows an infinite loading spinner and the page appears
 * "hung". This was the root cause of the home page hanging when an admin
 * added an ad script.
 *
 * By running the ad markup inside an iframe, any document.write() operates on
 * the iframe's own document. The parent React app is fully isolated and can
 * never be destroyed. The iframe auto-resizes to fit the creative.
 *
 * @param script  Raw ad markup — may include <script> tags, <iframe> embeds,
 *                plain HTML, etc. (whatever the admin pastes in Settings).
 * @param maxWidth  Optional Tailwind max-width class for the outer wrapper.
 */
export function DynamicAdSlot({
  script,
  maxWidth = 'max-w-4xl',
}: {
  script: string
  maxWidth?: string
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!iframeRef.current || !script.trim()) return

    // Build a self-contained HTML document for the ad creative.
    const doc =
      '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<base target="_blank">' +
      '<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden;width:100%;}' +
      'body{display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:40px;}' +
      'img{max-width:100%;height:auto;display:block;}a{color:inherit;}' +
      'iframe{max-width:100%;}</style>' +
      '</head><body>' + script.trim() + '</body></html>'

    iframeRef.current.srcdoc = doc
  }, [script])

  // Auto-resize the iframe to fit its content. Ad creatives frequently load
  // asynchronously (after the iframe `load` event), so we re-check the height
  // a few times to catch late-arriving content.
  const resize = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    try {
      const doc = iframe.contentDocument
      if (!doc || !doc.body) return
      const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, 40)
      if (h > 0) iframe.style.height = h + 'px'
    } catch {
      // cross-origin (some ads navigate the iframe away) — leave default height
    }
  }, [])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const onLoad = () => {
      resize()
      // Re-check for async ad content that loads after the initial paint
      setTimeout(resize, 400)
      setTimeout(resize, 1200)
      setTimeout(resize, 2500)
    }
    iframe.addEventListener('load', onLoad)
    return () => iframe.removeEventListener('load', onLoad)
  }, [script, resize])

  if (!script.trim()) return null

  return (
    <iframe
      ref={iframeRef}
      title="advertisement"
      className={`w-full ${maxWidth}`}
      style={{
        minHeight: '50px',
        height: '50px',
        border: 'none',
        display: 'block',
        background: 'transparent',
      }}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
    />
  )
}
