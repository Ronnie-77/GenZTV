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
// Reduced for fast fallback: if upstream doesn't respond in 5s for manifest,
// it's dead — let hls.js fall back quickly instead of waiting 8-15s.
const UPSTREAM_TIMEOUT_MANIFEST = 5000 // 5s for m3u8 manifests (was 8s)
const UPSTREAM_TIMEOUT_SEGMENT = 15000 // 15s for segments (was 30s)
// Live .ts streams: 30s for the INITIAL response (headers).
// Once headers arrive, the stream stays open with no timeout.
// The old 60s timeout meant a dead upstream took 60s × 2 attempts = 2 MINUTES
// before the proxy returned 504 — way too long for the user to wait.
// 30s is enough for slow-but-alive upstreams (e.g. cdn.jsssbd.com ts.php has
// ~16s TTFB), while dead upstreams fail in 30s instead of 2min.
const UPSTREAM_TIMEOUT_LIVE = 30000 // 30s for live .ts initial response (was 60s)

// Retry configuration — 0 retries for manifests: hls.js has its own retry
// layer (manifestLoadingMaxRetry=1), so the proxy retrying too causes
// duplicate concurrent upstream fetches (double bandwidth, slower fail).
// Segments keep 1 retry because hls.js segment retries are more disruptive.
const MAX_RETRIES_MANIFEST = 0 // 0 retries for manifests (was 1) — let hls.js retry
const MAX_RETRIES_SEGMENT = 1 // 1 retry for segments (was 2)
const RETRY_DELAY_MS = 300 // was 500

// ─── In-memory manifest cache ──────────────────────────────────────────────
// Live m3u8 manifests are reloaded by hls.js every 3-6s. Each reload hits the
// upstream again (2-3s latency). Caching the rewritten manifest means most
// live-reload cycles hit our cache instead — dramatically reducing upstream
// load and stabilizing playback.
//
// VOD manifests never change, so the cache is always safe for them.
//
// TTL CHOICE (4s):
//   hls.js reloads live manifests every targetDuration × liveSyncDurationCount
//   ≈ 3-6s. A 4s TTL means most reload cycles hit our cache (1 upstream fetch
//   per ~4s instead of per ~3s). This is safe because live playlist segments
//   are typically 2-6s long — within the 4s cache window, at most ONE new
//   segment appears, and hls.js will pick it up on the next uncached reload.
//   The old 2s TTL was too short — on slow upstreams (e.g. cdn.jsssbd.com
//   hls.php taking 4-5s per fetch), EVERY reload went to upstream, causing
//   the "m3u8_proxy plays very late" symptom the user reported.
//
// The cache key is the full upstream URL. We store { body, ts }.
// Entries are lazily evicted on read if older than MANIFEST_CACHE_TTL_MS.
const MANIFEST_CACHE_TTL_MS = 4000 // 4 seconds — safe for live, generous for VOD
const manifestCache = new Map<string, { body: string; ts: number }>()

function getCachedManifest(url: string): string | null {
  const entry = manifestCache.get(url)
  if (!entry) return null
  if (Date.now() - entry.ts > MANIFEST_CACHE_TTL_MS) {
    manifestCache.delete(url)
    return null
  }
  return entry.body
}

function setCachedManifest(url: string, body: string) {
  manifestCache.set(url, { body, ts: Date.now() })
  // Lazy eviction: if cache grows beyond 200 entries, prune the oldest 50.
  // This bounds memory usage even under heavy live-stream churn.
  if (manifestCache.size > 200) {
    const entries = [...manifestCache.entries()].sort((a, b) => a[1].ts - b[1].ts)
    for (let i = 0; i < 50 && i < entries.length; i++) {
      manifestCache.delete(entries[i][0])
    }
  }
}

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

    // Determine content type based on URL path + query string.
    // Some .ts URLs are behind proxy scripts (e.g. /api/ts.php?u=...stream.ts)
    // so we check both the pathname AND the full URL for .ts extension.
    const isM3u8 = url.includes('.m3u8') || url.includes('.m3u') || parsedUrl.pathname.endsWith('.m3u8') || parsedUrl.pathname.endsWith('.m3u')
    const isTs = (/\.ts(\?.*)?$/.test(parsedUrl.pathname) || /\.ts(\?|$)/.test(url)) && !parsedUrl.pathname.includes('.m3u8') && !parsedUrl.pathname.includes('.m3u')
    const isLiveTs = isTs && isLiveTsUrl(parsedUrl.pathname + parsedUrl.search)

    // ── Manifest cache check (BEFORE upstream fetch) ──
    // If we have a fresh (≤2s old) rewritten manifest for this URL, serve it
    // directly — skips the upstream fetch entirely. This is the single biggest
    // latency win for live streams: hls.js reloads the manifest every 3-6s,
    // and without caching each reload costs 2-3s of upstream wait.
    if (isM3u8 && !isTs) {
      const cached = getCachedManifest(url)
      if (cached !== null) {
        return new NextResponse(cached, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'X-Stream-Proxy-Cache': 'HIT',
          },
        })
      }
    }

    // Build upstream request headers — use VLC User-Agent for better IPTV server compatibility
    // Many IPTV/streaming servers block browser User-Agents but allow VLC
    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
      Accept: isM3u8
        ? 'application/vnd.apple.mpegurl,application/x-mpegurl,*/*'
        : isTs
          ? 'video/mp2t,*/*'
          : '*/*',
    }

    // Determine the correct Referer/Origin for the upstream request.
    // Most CDNs accept the upstream's own origin as Referer. However, some
    // streaming backends (notably bhalocast.pro:7059 used by playeraio.top
    // embeds) validate the Referer strictly and reject requests whose Referer
    // includes the non-standard port. For bhalocast, use the canonical
    // https://bhalocast.pro/ origin (matching what the embed iframe sends).
    if (/bhalocast\.(pro|com)/i.test(parsedUrl.hostname)) {
      fetchHeaders.Referer = 'https://bhalocast.pro/'
      fetchHeaders.Origin = 'https://bhalocast.pro'
    } else {
      fetchHeaders.Referer = parsedUrl.origin + '/'
      fetchHeaders.Origin = parsedUrl.origin
    }

    // For live .ts streams, use ReadableStream to pipe data incrementally
    if (isLiveTs) {
      console.log(`[stream-proxy] Live TS stream: ${url}`)
      let response: Response
      try {
        // 0 retries for live TS — a dead upstream should fail fast (30s)
        // instead of 30s × 2 = 60s. The mpegts.js client has its own retry
        // layer that will re-request the URL if needed.
        response = await fetchWithRetry(url, {
          headers: fetchHeaders,
          redirect: 'follow',
        }, UPSTREAM_TIMEOUT_LIVE, 0)
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

      // Pipe data in the background.
      // NOTE: We do NOT cap the total bytes for live streams. A previous 100MB
      // cap meant the proxy would cut the connection after ~44s–2.5min of video
      // (depending on bitrate), forcing mpegts.js to re-fetch — causing a
      // periodic stutter/rebuffer. Live streams should stay open until the
      // client disconnects. The finally block below handles cleanup when the
      // client (browser/mpegts.js) closes the connection.
      ;(async () => {
        try {
          // Read → write loop runs until upstream ends or client disconnects.
          // TransformStream applies natural backpressure: if the client reads
          // slowly, writer.write() awaits, which pauses reader.read(),
          // preventing memory bloat.
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
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
    // Support custom timeout via ?timeout= query param (used by JW player for slow servers)
    // When custom timeout is set, also increase retries for manifests (JW player needs patience)
    const customTimeout = req.nextUrl.searchParams.get('timeout')
    const customTimeoutMs = customTimeout ? parseInt(customTimeout, 10) : 0
    const fetchTimeout = customTimeoutMs > 0 ? customTimeoutMs : (isM3u8 ? UPSTREAM_TIMEOUT_MANIFEST : UPSTREAM_TIMEOUT_SEGMENT)
    const fetchRetries = customTimeoutMs > 0 && isM3u8 ? 2 : (isM3u8 ? MAX_RETRIES_MANIFEST : MAX_RETRIES_SEGMENT)
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
      // Cache MISS path — we already checked the cache at the top of GET().
      // Fetch the manifest from upstream, rewrite URLs, cache the result.

      const text = await response.text()

      // Log first few lines of the manifest for debugging
      const firstLines = text.split('\n').slice(0, 10).join('\n')
      console.log(`[stream-proxy] m3u8 content preview:\n${firstLines}`)

      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1)
      const originalQuery = parsedUrl.search
      // Propagate timeout param to rewritten URLs so sub-playlists also use extended timeout
      const timeoutParam = req.nextUrl.searchParams.get('timeout')
      const rewritten = rewriteM3u8Urls(text, baseUrl, originalQuery, timeoutParam)

      console.log(`[stream-proxy] Rewrote m3u8 (${text.length} bytes → ${rewritten.length} bytes)`)

      // Cache the rewritten manifest for 2s — subsequent hls.js reloads hit cache
      setCachedManifest(url, rewritten)

      return new NextResponse(rewritten, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Stream-Proxy-Cache': 'MISS',
        },
      })
    }

    // For .ts VOD segments — STREAM incrementally instead of buffering the whole
    // segment in memory. This lets the browser start feeding bytes to the demuxer
    // as soon as they arrive, reducing time-to-first-frame on slow connections.
    // (Live .ts streams above already use this pattern; VOD segments now match.)
    if (isTs && response.body) {
      const { readable, writable } = new TransformStream()
      const reader = response.body.getReader()
      const writer = writable.getWriter()
      ;(async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            await writer.write(value)
          }
        } catch {
          // Client disconnected or stream ended — normal
        } finally {
          try { await writer.close() } catch {}
          try { reader.cancel() } catch {}
        }
      })()

      const contentType = response.headers.get('content-type') || 'video/mp2t'
      return new NextResponse(readable, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'public, max-age=3600',
        },
      })
    }

    // Other binary data (rare) — buffer
    const body = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'application/octet-stream'

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Cache-Control': 'no-cache',
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
function rewriteM3u8Urls(manifest: string, baseUrl: string, originalQuery: string = '', timeoutParam: string | null = null): string {
  const proxyBase = '/api/stream-proxy?url='
  const preservedQuery = originalQuery && originalQuery !== '?' ? originalQuery : ''
  // Add timeout param to rewritten URLs so sub-resources also get extended timeout
  const timeoutSuffix = timeoutParam ? `&timeout=${timeoutParam}` : ''

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
          return `URI="${proxyBase}${encodeURIComponent(absoluteUrl)}${timeoutSuffix}"`
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
      return `${proxyBase}${encodeURIComponent(absoluteUrl)}${timeoutSuffix}`
    }

    // Relative URL lines
    if (trimmed && !trimmed.startsWith('#')) {
      try {
        let absoluteUrl = new URL(trimmed, baseUrl).href
        if (preservedQuery && !absoluteUrl.includes('?')) {
          absoluteUrl += preservedQuery
        }
        return `${proxyBase}${encodeURIComponent(absoluteUrl)}${timeoutSuffix}`
      } catch {
        // If URL parsing fails, return original line
        return line
      }
    }

    return line
  })

  return rewritten.join('\n')
}
