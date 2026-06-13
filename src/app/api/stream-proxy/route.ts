import { NextRequest, NextResponse } from 'next/server'

// GET /api/stream-proxy?url=ENCODED_URL
// Proxies HLS/m3u8, MPEG-TS segments, and live MPEG-TS streams to bypass CORS restrictions.
// Live .ts streams are streamed incrementally via ReadableStream.

export const maxDuration = 300 // 5 minute timeout for live streams

// Detect if a .ts URL is a live stream (not a VOD segment)
function isLiveTsUrl(pathname: string): boolean {
  if (pathname.includes('/live/')) return true
  // VOD segments typically have patterns like: segment123.ts, seg_004.ts, 00001.ts
  const segmentPattern = /[_-]?\d{3,}\.ts$|segment[_-]?\d+\.ts$|seg[_-]?\d+\.ts$/i
  if (segmentPattern.test(pathname)) return false
  return true
}

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

    // Determine content type
    const isM3u8 = url.includes('.m3u8') || parsedUrl.pathname.endsWith('.m3u8')
    const isTs = /\.ts(\?.*)?$/.test(parsedUrl.pathname) && !parsedUrl.pathname.includes('.m3u8')
    const isLiveTs = isTs && isLiveTsUrl(parsedUrl.pathname)

    const fetchHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      Accept: isM3u8
        ? 'application/vnd.apple.mpegurl,application/x-mpegurl,*/*'
        : isTs
          ? 'video/mp2t,*/*'
          : '*/*',
      Referer: parsedUrl.origin + '/',
    }

    // For live .ts streams, use ReadableStream to pipe data incrementally
    if (isLiveTs) {
      const response = await fetch(url, {
        headers: fetchHeaders,
        redirect: 'follow',
      })

      if (!response.ok) {
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

    const response = await fetch(url, {
      headers: fetchHeaders,
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
      const originalQuery = parsedUrl.search
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
 * Rewrite relative URLs inside an m3u8 manifest to go through our proxy.
 */
function rewriteM3u8Urls(manifest: string, baseUrl: string, originalQuery: string = ''): string {
  const proxyBase = '/api/stream-proxy?url='
  const preservedQuery = originalQuery && originalQuery !== '?' ? originalQuery : ''

  const lines = manifest.split('\n')
  const rewritten = lines.map((line) => {
    const trimmed = line.trim()

    if (trimmed.startsWith('#') || trimmed === '') {
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
      return line
    }

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      let absoluteUrl = trimmed
      if (preservedQuery && !absoluteUrl.includes('?')) {
        absoluteUrl += preservedQuery
      }
      return `${proxyBase}${encodeURIComponent(absoluteUrl)}`
    }

    if (trimmed && !trimmed.startsWith('#')) {
      try {
        let absoluteUrl = new URL(trimmed, baseUrl).href
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
