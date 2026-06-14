// Stream Proxy Mini-Service
// Dedicated lightweight proxy for live MPEG-TS and HLS streams.
// Runs on a separate port to avoid crashing the main Next.js server.

const PORT = 3031

// Prevent unhandled rejections from crashing the process
process.on('unhandledRejection', (reason) => {
  console.error('[StreamProxy] Unhandled rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[StreamProxy] Uncaught exception:', err)
})

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 })
    }

    // Only handle /proxy endpoint
    if (url.pathname !== '/proxy') {
      return new Response('Not Found', { status: 404 })
    }

    const targetUrl = url.searchParams.get('url')
    if (!targetUrl) {
      return Response.json({ error: 'Missing url parameter' }, { status: 400 })
    }

    try {
      const parsedUrl = new URL(targetUrl)
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return Response.json({ error: 'Invalid URL protocol' }, { status: 400 })
      }

      const isM3u8 = targetUrl.includes('.m3u8') || parsedUrl.pathname.endsWith('.m3u8')
      const isTs = /\.ts(\?.*)?$/.test(parsedUrl.pathname) && !parsedUrl.pathname.includes('.m3u8')
      const isLiveTs = isTs && isLiveTsUrl(parsedUrl.pathname)

      console.log(`[StreamProxy] ${isM3u8 ? 'HLS' : isLiveTs ? 'LIVE-TS' : isTs ? 'TS-SEGMENT' : 'OTHER'} -> ${targetUrl.substring(0, 100)}`)

      // For live .ts streams, use a ReadableStream to stream data incrementally
      if (isLiveTs) {
        // First, fetch headers to verify the stream is accessible
        const headResponse = await fetch(targetUrl, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Accept': 'video/mp2t,*/*',
          },
          redirect: 'follow',
        })

        if (!headResponse.ok) {
          return Response.json({ error: `Upstream error: ${headResponse.status}` }, { status: headResponse.status })
        }

        // Use a self-contained ReadableStream that fetches and pipes data
        const stream = new ReadableStream({
          async start(controller) {
            try {
              const response = await fetch(targetUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                  'Accept': 'video/mp2t,*/*',
                  'Referer': parsedUrl.origin + '/',
                },
                redirect: 'follow',
              })

              if (!response.ok || !response.body) {
                controller.error(new Error(`Upstream error: ${response.status}`))
                return
              }

              const reader = response.body.getReader()
              let bytesStreamed = 0
              const MAX_BYTES = 50 * 1024 * 1024 // 50MB max per request

              try {
                while (bytesStreamed < MAX_BYTES) {
                  const { done, value } = await reader.read()
                  if (done) break
                  bytesStreamed += value.byteLength
                  controller.enqueue(value)
                }
                controller.close()
              } catch {
                // Client disconnected or stream ended — this is normal for live streams
                try { controller.close() } catch {}
              } finally {
                try { reader.cancel() } catch {}
              }
            } catch {
              // Fetch failed — close the stream
              try { controller.close() } catch {}
            }
          },
          cancel() {
            // Client disconnected — called automatically when the client closes the connection
            console.log('[StreamProxy] Client disconnected from live stream')
          },
        })

        return new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': 'video/mp2t',
            ...corsHeaders(),
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        })
      }

      // For m3u8 and other non-live-stream requests
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          'Accept': isM3u8
            ? 'application/vnd.apple.mpegurl,application/x-mpegurl,*/*'
            : isTs
              ? 'video/mp2t,*/*'
              : '*/*',
          'Referer': parsedUrl.origin + '/',
        },
        redirect: 'follow',
      })

      if (!response.ok) {
        return Response.json({ error: `Upstream error: ${response.status}` }, { status: response.status })
      }

      // m3u8 files — rewrite URLs
      if (isM3u8) {
        const text = await response.text()
        const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1)
        const originalQuery = parsedUrl.search
        const rewritten = rewriteM3u8Urls(text, baseUrl, originalQuery)

        return new Response(rewritten, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
            ...corsHeaders(),
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        })
      }

      // VOD segments and other binary data — buffer
      const body = await response.arrayBuffer()
      const contentType = response.headers.get('content-type') || (isTs ? 'video/mp2t' : 'application/octet-stream')

      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          ...corsHeaders(),
          'Cache-Control': isTs ? 'public, max-age=3600' : 'no-cache',
        },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('[StreamProxy] Error:', msg)
      return Response.json({ error: 'Failed to proxy stream' }, { status: 500 })
    }
  },
})

console.log(`[StreamProxy] Running on port ${PORT}`)

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400',
  }
}

function isLiveTsUrl(pathname: string): boolean {
  if (pathname.includes('/live/')) return true
  const segmentPattern = /[_-]?\d{3,}\.ts$|segment[_-]?\d+\.ts$|seg[_-]?\d+\.ts$/i
  if (segmentPattern.test(pathname)) return false
  return true
}

function rewriteM3u8Urls(manifest: string, baseUrl: string, originalQuery: string = ''): string {
  const proxyBase = '/api/stream-proxy?url='
  const preservedQuery = originalQuery && originalQuery !== '?' ? originalQuery : ''

  const lines = manifest.split('\n')
  return lines.map(line => {
    const trimmed = line.trim()

    if (trimmed.startsWith('#') || trimmed === '') {
      if (trimmed.includes('URI="')) {
        return trimmed.replace(/URI="([^"]+)"/g, (_match: string, uri: string) => {
          let absoluteUrl = (uri.startsWith('http://') || uri.startsWith('https://')) ? uri : new URL(uri, baseUrl).href
          if (preservedQuery && !absoluteUrl.includes('?')) absoluteUrl += preservedQuery
          return `URI="${proxyBase}${encodeURIComponent(absoluteUrl)}"`
        })
      }
      return line
    }

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      let absoluteUrl = trimmed
      if (preservedQuery && !absoluteUrl.includes('?')) absoluteUrl += preservedQuery
      return `${proxyBase}${encodeURIComponent(absoluteUrl)}`
    }

    if (trimmed && !trimmed.startsWith('#')) {
      try {
        let absoluteUrl = new URL(trimmed, baseUrl).href
        if (preservedQuery && !absoluteUrl.includes('?')) absoluteUrl += preservedQuery
        return `${proxyBase}${encodeURIComponent(absoluteUrl)}`
      } catch {
        return line
      }
    }

    return line
  }).join('\n')
}
