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
    const isTs = url.includes('.ts') || parsedUrl.pathname.endsWith('.ts')

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

      // Rewrite relative URLs in the manifest
      const rewritten = rewriteM3u8Urls(text, baseUrl)

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

    // For .ts segments and other binary data, stream directly
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
 * This ensures that when HLS.js requests segment URLs, they also bypass CORS.
 */
function rewriteM3u8Urls(manifest: string, baseUrl: string): string {
  const proxyBase = '/api/stream-proxy?url='

  const lines = manifest.split('\n')
  const rewritten = lines.map((line) => {
    const trimmed = line.trim()

    // Skip comments and empty lines
    if (trimmed.startsWith('#') || trimmed === '') {
      // Rewrite URL attributes inside tags like: #EXT-X-KEY:URI="..."
      if (trimmed.includes('URI="')) {
        return trimmed.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
          if (uri.startsWith('http://') || uri.startsWith('https://')) {
            return `URI="${proxyBase}${encodeURIComponent(uri)}"`
          }
          // Relative URL — resolve against base
          const absoluteUrl = new URL(uri, baseUrl).href
          return `URI="${proxyBase}${encodeURIComponent(absoluteUrl)}"`
        })
      }
      return line
    }

    // This line is a URL (segment or sub-manifest)
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      // Already absolute — just proxy it
      return `${proxyBase}${encodeURIComponent(trimmed)}`
    }

    // Relative URL — resolve against base
    if (trimmed && !trimmed.startsWith('#')) {
      try {
        const absoluteUrl = new URL(trimmed, baseUrl).href
        return `${proxyBase}${encodeURIComponent(absoluteUrl)}`
      } catch {
        return line
      }
    }

    return line
  })

  return rewritten.join('\n')
}
