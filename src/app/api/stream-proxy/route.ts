import { NextRequest, NextResponse } from 'next/server'

// GET /api/stream-proxy?url=ENCODED_URL
// Proxies HLS/m3u8, MPEG-TS segments, and live MPEG-TS streams to bypass CORS restrictions.
// Live .ts streams are streamed incrementally via ReadableStream.
//
// Features:
// - AbortController with configurable timeout for upstream requests
// - VLC User-Agent for better IPTV server compatibility
// - Origin header sent alongside Referer for better compatibility
// - Enhanced m3u8 rewriting: handles #EXT-X-STREAM-INF (variant playlists),
//   #EXT-X-KEY URI attributes, and #EXT-X-MAP URI attributes
// - Detailed error logging and responses
// - Retry logic for failed upstream requests (2 retries with exponential backoff)

export const maxDuration = 300 // 5 minute timeout for live streams

// Upstream request timeout (ms)
// For m3u8 manifests, use very short timeout so player can fallback to direct mode quickly
const UPSTREAM_TIMEOUT_MANIFEST = 6000 // 6s for m3u8 manifests (fail fast → fallback to direct)
const UPSTREAM_TIMEOUT_SEGMENT = 60000 // 60s for segments (slower is ok)
const UPSTREAM_TIMEOUT_LIVE = 60000 // 60s for live .ts streams

// Retry configuration
const MAX_RETRIES_MANIFEST = 0 // No retries for manifests (fail fast → let player fallback)
const MAX_RETRIES_SEGMENT = 2 // 2 retries for segments
const RETRY_DELAY_MS = 1000

// Detect if a .ts URL is a live stream (not a VOD segment)
function isLiveTsUrl(pathname: string): boolean {
  if (pathname.includes('/live/')) return true
  // VOD segments typically have patterns like: segment123.ts, seg_004.ts, 00001.ts
  const segmentPattern = /[_-]?\d{3,}\.ts$|segment[_-]?\d+\.ts$|seg[_-]?\d+\.ts$/i
  if (segmentPattern.test(pathname)) return false
  return true
}

// Helper: fetch with retry + timeout
async function fetchWithRetry(
  fetchUrl: string,
  opts: RequestInit,
  timeoutMs: number = UPSTREAM_TIMEOUT_SEGMENT,
  maxRetries: number = MAX_RETRIES_SEGMENT
): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(fetchUrl, { ...opts, signal: controller.signal })
      clearTimeout(timeout)
      return res
    } catch (err) {
      clearTimeout(timeout)
      lastError = err instanceof Error ? err : new Error('Unknown error')
      if (attempt < maxRetries) {
        const delay = RETRY_DELAY_MS * (attempt + 1)
        console.log(`[stream-proxy] Retry ${attempt + 1}/${maxRetries} for ${fetchUrl} (waiting ${delay}ms)`)
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }
  throw lastError || new Error('All retries failed')
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  try {
    // Validate URL
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: 'Invalid URL protocol' }, { status: 400 })
    }

    // Determine content type based on URL path
    const isM3u8 = url.includes('.m3u8') || url.includes('.m3u') || parsedUrl.pathname.endsWith('.m3u8') || parsedUrl.pathname.endsWith('.m3u')
    const isTs = /\.ts(\?.*)?$/.test(parsedUrl.pathname) && !parsedUrl.pathname.includes('.m3u8') && !parsedUrl.pathname.includes('.m3u')
    const isLiveTs = isTs && isLiveTsUrl(parsedUrl.pathname)

    // Build upstream request headers — use VLC User-Agent for better IPTV server compatibility
    // Many IPTV/streaming servers block browser User-Agents but allow VLC
    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
      Accept: isM3u8
        ? 'application/vnd.apple.mpegurl,application/x-mpegurl,*/*'
        : isTs
          ? 'video/mp2t,*/*'
          : '*/*',
      // Send Referer and Origin matching the upstream origin — many CDNs require these
      Referer: parsedUrl.origin + '/',
      Origin: parsedUrl.origin,
    }

    // For live .ts streams, use ReadableStream to pipe data incrementally
    if (isLiveTs) {
      console.log(`[stream-proxy] Live TS stream: ${url}`)
      let response: Response
      try {
        response = await fetchWithRetry(url, {
          headers: fetchHeaders,
          redirect: 'follow',
        }, UPSTREAM_TIMEOUT_LIVE, MAX_RETRIES_SEGMENT)
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : 'Unknown fetch error'
        console.error(`[stream-proxy] Live TS fetch failed: ${msg}`)
        if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
          return NextResponse.json(
            { error: `Upstream request timed out after ${UPSTREAM_TIMEOUT_LIVE / 1000}s` },
            { status: 504 }
          )
        }
        return NextResponse.json(
          { error: `Failed to connect to upstream: ${msg}` },
          { status: 502 }
        )
      }

      if (!response.ok) {
        console.error(`[stream-proxy] Live TS upstream error: ${response.status}`)
        return NextResponse.json(
          { error: `Upstream error: ${response.status}` },
          { status: response.status }
        )
      }

      if (!response.body) {
        return NextResponse.json(
          { error: 'No response body from upstream' },
          { status: 502 }
        )
      }

      // Create a TransformStream to pipe the upstream data through
      const { readable, writable } = new TransformStream()
      const reader = response.body.getReader()
      const writer = writable.getWriter()

      // Pipe data in the background
      ;(async () => {
        try {
          let bytesStreamed = 0
          const MAX_BYTES = 100 * 1024 * 1024 // 100MB max per request
          while (bytesStreamed < MAX_BYTES) {
            const { done, value } = await reader.read()
            if (done) break
            bytesStreamed += value.byteLength
            await writer.write(value)
          }
        } catch {
          // Client disconnected or stream ended — normal for live streams
        } finally {
          try { await writer.close() } catch {}
          try { reader.cancel() } catch {}
        }
      })()

      return new NextResponse(readable, {
        status: 200,
        headers: {
          'Content-Type': 'video/mp2t',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      })
    }

    // Non-live requests: m3u8, VOD .ts segments, and other content
    // Use shorter timeout and fewer retries for m3u8 manifests to enable faster fallback
    const fetchTimeout = isM3u8 ? UPSTREAM_TIMEOUT_MANIFEST : UPSTREAM_TIMEOUT_SEGMENT
    const fetchRetries = isM3u8 ? MAX_RETRIES_MANIFEST : MAX_RETRIES_SEGMENT
    console.log(`[stream-proxy] Fetching: ${url} (m3u8=${isM3u8}, ts=${isTs}, timeout=${fetchTimeout / 1000}s, retries=${fetchRetries})`)
    let response: Response
    try {
      response = await fetchWithRetry(url, {
        headers: fetchHeaders,
        redirect: 'follow',
      }, fetchTimeout, fetchRetries)
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : 'Unknown fetch error'
      console.error(`[stream-proxy] Fetch failed for ${url}: ${msg}`)
      if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
        return NextResponse.json(
          { error: `Upstream request timed out after ${fetchTimeout / 1000}s` },
          { status: 504 }
        )
      }
      return NextResponse.json(
        { error: `Failed to connect to upstream: ${msg}` },
        { status: 502 }
      )
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '')
      console.error(`[stream-proxy] Upstream error ${response.status} for ${url}: ${bodyText.slice(0, 200)}`)
      return NextResponse.json(
        { error: `Upstream error: ${response.status}`, detail: bodyText.slice(0, 500) },
        { status: response.status }
      )
    }

    // For m3u8 files, rewrite relative URLs to go through this proxy
    if (isM3u8) {
      const text = await response.text()

      // Log first few lines of the manifest for debugging
      const firstLines = text.split('\n').slice(0, 10).join('\n')
      console.log(`[stream-proxy] m3u8 content preview:\n${firstLines}`)

      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1)
      const originalQuery = parsedUrl.search
      const rewritten = rewriteM3u8Urls(text, baseUrl, originalQuery)

      console.log(`[stream-proxy] Rewrote m3u8 (${text.length} bytes → ${rewritten.length} bytes)`)

      return new NextResponse(rewritten, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      })
    }

    // For .ts VOD segments and other binary data, buffer the response
    const body = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || (isTs ? 'video/mp2t' : 'application/octet-stream')

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Cache-Control': isTs ? 'public, max-age=3600' : 'no-cache',
      },
    })
  } catch (error) {
    console.error('[stream-proxy] Unhandled error:', error)
    return NextResponse.json(
      { error: 'Failed to proxy stream', detail: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    },
  })
}

/**
 * Rewrite URLs inside an m3u8 manifest to go through our proxy.
 *
 * Handles:
 * - Plain URL lines (variant playlists, segment URLs)
 * - #EXT-X-STREAM-INF companion URLs (next line after the tag)
 * - URI="..." attributes in #EXT-X-KEY (encryption key URLs)
 * - URI="..." attributes in #EXT-X-MAP (init segment URLs)
 * - Both absolute and relative URLs
 */
function rewriteM3u8Urls(manifest: string, baseUrl: string, originalQuery: string = ''): string {
  const proxyBase = '/api/stream-proxy?url='
  const preservedQuery = originalQuery && originalQuery !== '?' ? originalQuery : ''

  const lines = manifest.split('\n')
  const rewritten = lines.map((line) => {
    const trimmed = line.trim()

    // Empty lines — pass through
    if (trimmed === '') return line

    // Tag lines that may contain URI="..." attributes
    if (trimmed.startsWith('#')) {
      // Handle #EXT-X-KEY, #EXT-X-MAP, and any other tag with URI="..."
      if (trimmed.includes('URI="')) {
        return trimmed.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
          let absoluteUrl: string
          if (uri.startsWith('http://') || uri.startsWith('https://')) {
            absoluteUrl = uri
          } else {
            absoluteUrl = new URL(uri, baseUrl).href
          }
          if (preservedQuery && !absoluteUrl.includes('?')) {
            absoluteUrl += preservedQuery
          }
          return `URI="${proxyBase}${encodeURIComponent(absoluteUrl)}"`
        })
      }

      // #EXT-X-STREAM-INF and other tags without URI — pass through as-is
      // The URL on the next line will be rewritten below
      return line
    }

    // Plain URL lines (variant playlist URLs, segment URLs)
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      let absoluteUrl = trimmed
      if (preservedQuery && !absoluteUrl.includes('?')) {
        absoluteUrl += preservedQuery
      }
      return `${proxyBase}${encodeURIComponent(absoluteUrl)}`
    }

    // Relative URL lines
    if (trimmed && !trimmed.startsWith('#')) {
      try {
        let absoluteUrl = new URL(trimmed, baseUrl).href
        if (preservedQuery && !absoluteUrl.includes('?')) {
          absoluteUrl += preservedQuery
        }
        return `${proxyBase}${encodeURIComponent(absoluteUrl)}`
      } catch {
        // If URL parsing fails, return original line
        return line
      }
    }

    return line
  })

  return rewritten.join('\n')
}
