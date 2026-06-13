import { NextRequest, NextResponse } from 'next/server'

// GET /api/stream-proxy?url=ENCODED_URL
// Proxies HLS/m3u8 and MPEG-TS streams to bypass CORS restrictions.
// Also rewrites relative URLs inside m3u8 manifests to go through this proxy.
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  try {
    // Validate URL
    const parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: 'Invalid URL protocol' }, { status: 400 })
    }

    // Determine content type based on URL extension
    const isM3u8 = url.includes('.m3u8') || parsedUrl.pathname.endsWith('.m3u8')
    // Be more precise with .ts detection — only match .ts at end of path (before query string)
    // Avoid false positives like .m3u8 or .ts in the middle of path segments
    const isTs = /\.ts(\?.*)?$/.test(parsedUrl.pathname) && !parsedUrl.pathname.includes('.m3u8')

    // Check if this is a continuous/live .ts stream (not a VOD segment)
    // Live .ts streams are typically at paths like /live/.../channel.ts
    // VOD segments are typically at paths like /segments/.../segment0001.ts
    const isLiveTs = isTs && isLiveTsUrl(url, parsedUrl.pathname)

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        Accept: isM3u8
          ? 'application/vnd.apple.mpegurl,application/x-mpegurl,*/*'
          : isTs
            ? 'video/mp2t,*/*'
            : '*/*',
        Referer: parsedUrl.origin + '/',
        Origin: parsedUrl.origin,
      },
      redirect: 'follow',
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${response.status}` },
        { status: response.status }
      )
    }

    // For m3u8 files, rewrite relative URLs to go through this proxy
    if (isM3u8) {
      const text = await response.text()
      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1)
      // Preserve original query parameters for segment resolution
      const originalQuery = parsedUrl.search

      // Rewrite relative URLs in the manifest
      const rewritten = rewriteM3u8Urls(text, baseUrl, originalQuery)

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

    // For continuous live .ts streams, use streaming response to avoid hanging
    // (live streams never complete, so arrayBuffer() would hang forever)
    if (isLiveTs && response.body) {
      // Stream the response body directly to the client
      const stream = response.body
      const contentType = response.headers.get('content-type') || 'video/mp2t'

      return new NextResponse(stream, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          // Don't set content-length for streams — size is unknown
          'Transfer-Encoding': 'chunked',
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
    console.error('Stream proxy error:', error)
    return NextResponse.json(
      { error: 'Failed to proxy stream' },
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
 * Detect if a .ts URL is a continuous live stream (not a VOD segment).
 * Live streams typically have paths like /live/.../channel.ts
 * VOD segments typically have paths like /segments/.../seg0001.ts or numbered segments
 */
function isLiveTsUrl(url: string, pathname: string): boolean {
  // If the path contains /live/ it's almost certainly a continuous stream
  if (pathname.includes('/live/')) return true

  // If the URL has no numbered segment pattern, treat as live
  // VOD segments usually have patterns like: seg001.ts, segment_001.ts, 00001.ts
  const segmentPattern = /[_-]?\d{3,}\.ts$|segment[_-]?\d+\.ts$|seg[_-]?\d+\.ts$/i
  if (segmentPattern.test(pathname)) return false

  // If the .ts file is directly under a path that looks like a stream endpoint
  // (no extensionless directory + numbered segment pattern), treat as live
  return true
}

/**
 * Rewrite relative URLs inside an m3u8 manifest to go through our proxy.
 * This ensures that when HLS.js requests segment URLs, they also bypass CORS.
 * Also preserves original query parameters (like ?token=xxx) for segment requests.
 */
function rewriteM3u8Urls(manifest: string, baseUrl: string, originalQuery: string = ''): string {
  const proxyBase = '/api/stream-proxy?url='

  // Extract meaningful query params (exclude empty tokens)
  const preservedQuery = originalQuery && originalQuery !== '?' ? originalQuery : ''

  const lines = manifest.split('\n')
  const rewritten = lines.map((line) => {
    const trimmed = line.trim()

    // Skip comments and empty lines
    if (trimmed.startsWith('#') || trimmed === '') {
      // Rewrite URL attributes inside tags like: #EXT-X-KEY:URI="..."
      if (trimmed.includes('URI="')) {
        return trimmed.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
          let absoluteUrl: string
          if (uri.startsWith('http://') || uri.startsWith('https://')) {
            absoluteUrl = uri
          } else {
            // Relative URL — resolve against base
            absoluteUrl = new URL(uri, baseUrl).href
          }
          // Append original query params if the URL doesn't already have them
          if (preservedQuery && !absoluteUrl.includes('?')) {
            absoluteUrl += preservedQuery
          }
          return `URI="${proxyBase}${encodeURIComponent(absoluteUrl)}"`
        })
      }
      return line
    }

    // This line is a URL (segment or sub-manifest)
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      // Already absolute — just proxy it
      let absoluteUrl = trimmed
      // Append original query params if the URL doesn't already have them
      if (preservedQuery && !absoluteUrl.includes('?')) {
        absoluteUrl += preservedQuery
      }
      return `${proxyBase}${encodeURIComponent(absoluteUrl)}`
    }

    // Relative URL — resolve against base
    if (trimmed && !trimmed.startsWith('#')) {
      try {
        let absoluteUrl = new URL(trimmed, baseUrl).href
        // Append original query params if the URL doesn't already have them
        if (preservedQuery && !absoluteUrl.includes('?')) {
          absoluteUrl += preservedQuery
        }
        return `${proxyBase}${encodeURIComponent(absoluteUrl)}`
      } catch {
        return line
      }
    }

    return line
  })

  return rewritten.join('\n')
}
