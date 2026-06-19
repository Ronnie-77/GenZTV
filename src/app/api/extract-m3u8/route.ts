import { NextRequest, NextResponse } from 'next/server'

// GET /api/extract-m3u8?url=<ntv.cx | cdnlivetv.tv | playeraio.top | playerado.top | bhalocast.pro | bhalocast.com URL>
//
// Extracts the underlying m3u8 stream URL from streaming embed pages.
// Currently supports:
//   - ntv.cx/embed?t=... → fetches page, finds inner cdnlivetv.tv iframe,
//     fetches that, extracts base64-encoded m3u8 URL from inline JS.
//   - cdnlivetv.tv/api/v1/channels/player/... → directly extracts m3u8.
//   - playeraio.top / playerado.top embed pages → reads the /old/*.js
//     document.write() to discover the bhalocast.pro/.com player iframe,
//     fetches that, extracts the m3u8 URL built from a char-array.
//   - bhalocast.pro / bhalocast.com player pages → directly extracts m3u8.
//
// Returns: { m3u8: string, channelName?: string } on success
//          { error: string } on failure
//
// This lets us play the stream directly with our HlsPlayer (no ads, no
// loading-splash issues, no nested-iframe "content blocked" errors) instead
// of routing through the iframe proxy.

const BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

function decodeB64ChunksDecode(s: string): string {
  // Replicates cdnlivetv.tv's UHUCjyjMNG() function:
  //   s = s.replace(/-/g,'+').replace(/_/g,'/');
  //   while(s.length%4) s+='=';
  //   try { return decodeURIComponent(escape(atob(s))) } catch(e) { return atob(s) }
  // The try path decodes as UTF-8; the catch returns raw bytes (latin1).
  // In Node.js, Buffer.toString('utf-8') doesn't throw on invalid UTF-8 — it
  // inserts \ufffd replacement chars. So we detect that and fall back to
  // latin1, which preserves all bytes as-is (matching atob's behavior).
  let out = s.replace(/-/g, '+').replace(/_/g, '/')
  while (out.length % 4) out += '='
  const buf = Buffer.from(out, 'base64')
  const utf8 = buf.toString('utf-8')
  // If the utf-8 decode produced replacement chars, the original bytes
  // weren't valid UTF-8 — fall back to latin1 (raw bytes as chars).
  if (utf8.includes('\uFFFD')) {
    return buf.toString('latin1')
  }
  return utf8
}

// Extract the m3u8 URL from a cdnlivetv.tv player page.
// The page contains obfuscated JS that builds the URL from base64 chunks:
//   var xYAwpjZU='aHR0cHM'; var FfWZsGgH='Og'; ...
//   var XRYErjhfgOwQ = UHUCjyjMNG(xYAwpjZU) + UHUCjyjMNG(FfWZsGgH) + ...
// We find all the single-quoted base64 chunk variables, decode each, and
// concatenate — the result is the m3u8 URL.
function extractM3u8FromCdnlivetv(html: string): string | null {
  // Strategy 1: find the assembled variable assignment
  // Pattern: var <RESULT>=UHUCjyjMNG(<v1>)+UHUCjyjMNG(<v2>)+...;
  const assignMatch = html.match(
    /var\s+([A-Za-z_$][\w$]*)\s*=\s*(UHUCjyjMNG\([A-Za-z_$][\w$]*\)(?:\s*\+\s*UHUCjyjMNG\([A-Za-z_$][\w$]*\))*)\s*;/
  )
  if (assignMatch) {
    // Find the chunk variable names in the assignment
    const chunkVarNames = Array.from(
      assignMatch[2].matchAll(/UHUCjyjMNG\(([A-Za-z_$][\w$]*)\)/g)
    ).map((m) => m[1])
    // For each chunk var name, find its definition: var <name>='<base64>';
    const chunks: string[] = []
    for (const name of chunkVarNames) {
      const defMatch = html.match(
        new RegExp(`var\\s+${name}\\s*=\\s*'([^']+)'`)
      )
      if (defMatch) {
        chunks.push(decodeB64ChunksDecode(defMatch[1]))
      }
    }
    if (chunks.length > 0) {
      const url = chunks.join('')
      // The last base64 chunk may contain trailing garbage bytes (cdnlivetv.tv
      // adds noise). Extract only the valid URL portion.
      // The token parameter value is a base64 string: [A-Za-z0-9+/]+={0,2}
      // The garbage bytes (often \ufffd replacement chars or high-byte chars)
      // are NOT valid base64 chars, so the regex stops at the right place.
      const urlMatch = url.match(/https?:\/\/[^\s"'<>\x00-\x1f]+\.m3u8\?token=[A-Za-z0-9+/]+={0,2}/i)
      if (urlMatch) return urlMatch[0]
      // Fallback: match up to first non-URL char
      const fallbackMatch = url.match(/https?:\/\/[^\s"'<>\x00-\x1f]+\.m3u8[^\s"'<>\x00-\x1f]*/i)
      if (fallbackMatch) return fallbackMatch[0]
      if (/^https?:\/\/.+\.m3u8/i.test(url)) return url
    }
  }

  // Strategy 2: brute-force — find all `var <name>='<base64>';` definitions,
  // decode each, and look for a concatenation that forms an m3u8 URL.
  const allDefs = Array.from(
    html.matchAll(/var\s+([A-Za-z_$][\w$]*)\s*=\s*'([A-Za-z0-9+/_=-]+)'\s*;/g)
  )
  const decoded = allDefs
    .map((m) => {
      const raw = m[2]
      if (!/^[A-Za-z0-9+/_=-]+$/.test(raw)) return null
      try {
        return decodeB64ChunksDecode(raw)
      } catch {
        return null
      }
    })
    .filter((s): s is string => !!s && s.length > 0)

  // Try to find a full m3u8 URL in any single decoded chunk
  for (const d of decoded) {
    if (/^https?:\/\/.+\.m3u8/i.test(d)) {
      // Clean: extract only the valid URL portion with proper token
      const m = d.match(/https?:\/\/[^\s"'<>\x00-\x1f]+\.m3u8\?token=[A-Za-z0-9+/]+={0,2}/i)
      if (m) return m[0]
      const m2 = d.match(/https?:\/\/[^\s"'<>\x00-\x1f]+\.m3u8[^\s"'<>\x00-\x1f]*/i)
      if (m2) return m2[0]
      return d
    }
  }

  // Try concatenating all decoded chunks in order
  const joined = decoded.join('')
  // Primary: match URL with token cleanup (stops at non-base64 chars)
  const m3u8Match = joined.match(/https?:\/\/[^\s"'<>\x00-\x1f]+\.m3u8\?token=[A-Za-z0-9+/]+={0,2}/i)
  if (m3u8Match) return m3u8Match[0]
  // Fallback: match URL up to first non-URL char
  const m3u8Fallback = joined.match(/https?:\/\/[^\s"'<>\x00-\x1f]+\.m3u8[^\s"'<>\x00-\x1f]*/i)
  if (m3u8Fallback) return m3u8Fallback[0]

  return null
}

// Extract the channel name from a cdnlivetv.tv page (for display).
function extractChannelName(html: string): string | undefined {
  const m = html.match(/var\s+_cn\s*=\s*'([^']+)'/)
  return m ? m[1] : undefined
}

// Find the inner cdnlivetv.tv iframe URL from an ntv.cx embed page.
function findCdnlivetvIframe(html: string): string | null {
  const m = html.match(
    /<iframe[^>]*\bsrc=["'](https?:\/\/cdnlivetv\.tv[^"']+)["'][^>]*>/i
  )
  if (m) {
    return m[1]
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
  }
  return null
}

// ── bhalocast.pro / bhalocast.com extraction ──
//
// These player pages (reached via playeraio.top / playerado.top embed pages)
// build the m3u8 URL at runtime from a character array, e.g.:
//   function yTimtel(){return(["h","t","t","p","s",":","\/","\/",...].join("")
//     + someArray.join("") + document.getElementById("...").innerHTML);}
// The char array alone contains a complete, working m3u8 URL with md5/expires
// /ch/s query params. We extract the first char-array whose joined characters
// form an https://...m3u8... URL.
function extractM3u8FromBhalocast(html: string): string | null {
  // Find every `function NAME(){return(["c","c",...].join("") ...}` block.
  // We only care about the ["c","c",...] array — extract all single-char
  // string literals (single- OR double-quoted) and concatenate.
  const funcMatches = Array.from(
    html.matchAll(/return\s*\(\s*\[([^\]]+)\]\s*\.\s*join\s*\(\s*["']{2}\s*\)/g)
  )
  for (const fm of funcMatches) {
    const arrBody = fm[1]
    // Match single-char strings: 'x' OR "x" (with optional escape)
    const chars = Array.from(
      arrBody.matchAll(/(['"])((?:\\.|[^'\\]))\1/g)
    ).map((m) => {
      const c = m[2]
      // Handle escape sequences: \/ → /, \\ → \, \' → ', \" → "
      if (c.length === 2 && c[0] === '\\') return c[1]
      return c
    })
    const joined = chars.join('')
    // Look for a complete m3u8 URL inside the joined string
    const m = joined.match(/https?:\/\/[^\s"'<>\x00-\x1f`]+\.m3u8[^\s"'<>\x00-\x1f`]*/i)
    if (m) return m[0]
  }
  return null
}

// Given an embed page (playeraio.top / playerado.top), find the bhalocast
// player iframe URL. The embed page sets `fid`, `v_con`, `v_dt` variables and
// loads a `/old/*.js` script that calls document.write('<iframe src="TEMPLATE'
// + fid + ...>'). We fetch that JS, extract the URL template, and substitute
// the variables.
async function findBhalocastPlayerUrl(
  embedHtml: string,
  embedUrl: string
): Promise<string | null> {
  // 1. Extract fid / v_con / v_dt from the embed page
  const fidMatch = embedHtml.match(/\bfid\s*=\s*["']([^"']+)["']/)
  const vconMatch = embedHtml.match(/\bv_con\s*=\s*["']([^"']+)["']/)
  const vdtMatch = embedHtml.match(/\bv_dt\s*=\s*["']([^"']+)["']/)
  const fid = fidMatch?.[1]
  const vCon = vconMatch?.[1] || ''
  const vDt = vdtMatch?.[1] || ''
  if (!fid) return null

  // 2. Find the /old/*.js script src (well.js, ano2.js, etc.)
  const jsMatch = embedHtml.match(
    /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
  )
  let jsSrc: string | null = null
  if (jsMatch) {
    for (const tag of jsMatch) {
      const m = tag.match(/src=["']([^"']+)["']/i)
      if (m && /\/old\/[^/]+\.js/i.test(m[1])) {
        jsSrc = m[1]
        break
      }
    }
  }
  if (!jsSrc) return null

  // Resolve the JS URL relative to the embed page origin
  const embedOrigin = new URL(embedUrl).origin
  const jsUrl = jsSrc.startsWith('http')
    ? jsSrc
    : new URL(jsSrc, embedOrigin + '/').href

  // 3. Fetch the JS and extract the bhalocast URL template from document.write
  let jsText: string
  try {
    jsText = await fetchWithBrowserUA(jsUrl)
  } catch {
    return null
  }

  // The JS calls document.write with a concatenated string, e.g.:
  //   document.write('<ifr'+'ame src="https://bhalocast.pro/atofplay.php?v='
  //     + fid + '&secure=' + v_con + '&expires=' + v_dt
  //     + '" width=' + v_width + ' height=' + v_height + ' scrolling="no" ...></ifr'+'ame>')
  // The string is split across many literals to hinder scraping. We:
  //   1. Tokenize the document.write(...) argument into string literals and
  //      variable references.
  //   2. Walk the tokens, concatenating literals and substituting fid/v_con/
  //      v_dt. We START at the first literal containing "https://bhalocast."
  //      and STOP at the first literal that looks like an iframe attribute
  //      (starts with a quote + space, or contains width/height/scrolling/etc.)
  const dwBodyMatch = jsText.match(/document\.write\s*\(\s*([\s\S]+?)\)\s*;?\s*$/m)
  if (!dwBodyMatch) return null
  const dwBody = dwBodyMatch[1]
  // Tokenize: match single-quoted strings, double-quoted strings, identifiers, +
  const tokenRegex = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|([A-Za-z_$][\w$]*)|\+/g
  const tokens: Array<{ type: 'str' | 'var' | 'plus'; value: string }> = []
  let tm: RegExpExecArray | null
  while ((tm = tokenRegex.exec(dwBody))) {
    if (tm[1] !== undefined) tokens.push({ type: 'str', value: tm[1] })
    else if (tm[2] !== undefined) tokens.push({ type: 'str', value: tm[2] })
    else if (tm[3] !== undefined) tokens.push({ type: 'var', value: tm[3] })
    else tokens.push({ type: 'plus', value: '+' })
  }

  // Find the first string token containing the bhalocast URL, then concatenate
  // forward until we hit an iframe-attribute literal.
  const bhalocastStart = tokens.findIndex(
    (t) => t.type === 'str' && /https?:\/\/bhalocast\./i.test(t.value)
  )
  if (bhalocastStart === -1) return null

  const varMap: Record<string, string> = {
    fid,
    v_con: vCon,
    v_dt: vDt,
  }
  // Attribute keywords that signal the URL portion has ended
  const attrPattern = /\b(width|height|scrolling|frameborder|allow|style|id|class|border|margin|padding)\b/i

  let url = tokens[bhalocastStart].value
  for (let i = bhalocastStart + 1; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.type === 'plus') continue
    if (t.type === 'str') {
      // If this literal looks like the start of an HTML attribute, stop.
      // The URL ends right before the closing quote of the src attribute.
      // Typical pattern: '" width=' or '" height=' — i.e. a quote then a space
      // then an attribute name.
      if (/["']\s*\w+\s*=/.test(t.value) && attrPattern.test(t.value)) break
      // Also stop if the literal contains "> (end of opening tag) or </iframe
      if (/["']\s*>|<\/iframe/i.test(t.value)) break
      url += t.value
    } else if (t.type === 'var') {
      if (t.value in varMap) {
        url += varMap[t.value]
      } else {
        // Unknown variable inside the URL — stop
        break
      }
    }
  }

  // The URL we built may have a trailing quote from the src attribute close.
  // Extract just the https://... portion up to the first whitespace or quote.
  const urlMatch = url.match(/https?:\/\/[^\s"'<>`]+/i)
  if (urlMatch) return urlMatch[0]

  // Fallback: build from known patterns
  const urlBase = tokens[bhalocastStart].value
  if (/bhalocast\.pro/i.test(urlBase)) {
    return `${urlBase}${fid}&secure=${vCon}&expires=${vDt}`
  }
  return `${urlBase}${fid}`
}

async function fetchWithBrowserUA(url: string, refererOverride?: string): Promise<string> {
  const parsed = new URL(url)
  const res = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      Referer: refererOverride || parsed.origin + '/',
    },
    redirect: 'follow',
  })
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status}`)
  }
  return await res.text()
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Invalid URL protocol' }, { status: 400 })
    }

    let cdnlivetvUrl: string
    let cdnlivetvHtml: string

    // ── bhalocast.pro / bhalocast.com direct player pages ──
    if (/bhalocast\.(pro|com)/i.test(parsed.hostname)) {
      const bhaloHtml = await fetchWithBrowserUA(url)
      const m3u8 = extractM3u8FromBhalocast(bhaloHtml)
      if (!m3u8) {
        return NextResponse.json(
          { error: 'Could not extract m3u8 from bhalocast player page' },
          { status: 404 }
        )
      }
      return NextResponse.json(
        { m3u8, source: url },
        { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=30' } }
      )
    }

    // ── playeraio.top / playerado.top embed pages ──
    // These load a /old/*.js that document.writes a bhalocast player iframe.
    if (/playeraio\.top|playerado\.top/i.test(parsed.hostname)) {
      const embedHtml = await fetchWithBrowserUA(url)
      const bhaloUrl = await findBhalocastPlayerUrl(embedHtml, url)
      if (!bhaloUrl) {
        return NextResponse.json(
          { error: 'Could not find bhalocast player iframe URL' },
          { status: 404 }
        )
      }
      try {
        // bhalocast.pro/.com require the Referer to be the embed site
        // (playeraio.top / playerado.top) — they return empty for self-origin
        // referers. Pass the embed page origin as the Referer.
        const bhaloHtml = await fetchWithBrowserUA(bhaloUrl, parsed.origin + '/')
        const m3u8 = extractM3u8FromBhalocast(bhaloHtml)
        if (!m3u8) {
          return NextResponse.json(
            { error: 'Could not extract m3u8 from bhalocast player page' },
            { status: 404 }
          )
        }
        return NextResponse.json(
          { m3u8, source: bhaloUrl },
          { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=30' } }
        )
      } catch {
        return NextResponse.json(
          { error: 'bhalocast player page unreachable (likely Cloudflare-blocked)' },
          { status: 502 }
        )
      }
    }

    if (parsed.hostname.includes('cdnlivetv.tv')) {
      cdnlivetvUrl = url
      cdnlivetvHtml = await fetchWithBrowserUA(url)
    } else if (parsed.hostname.includes('ntv.cx')) {
      const ntvHtml = await fetchWithBrowserUA(url)
      const innerUrl = findCdnlivetvIframe(ntvHtml)
      if (!innerUrl) {
        return NextResponse.json(
          { error: 'No cdnlivetv.tv iframe found in ntv.cx page' },
          { status: 404 }
        )
      }
      cdnlivetvUrl = innerUrl
      cdnlivetvHtml = await fetchWithBrowserUA(innerUrl)
    } else {
      const html = await fetchWithBrowserUA(url)
      const innerUrl = findCdnlivetvIframe(html)
      if (innerUrl) {
        cdnlivetvUrl = innerUrl
        cdnlivetvHtml = await fetchWithBrowserUA(innerUrl)
      } else {
        const m3u8 = extractM3u8FromCdnlivetv(html)
        if (m3u8) {
          return NextResponse.json({
            m3u8,
            channelName: extractChannelName(html),
            source: 'direct',
          })
        }
        return NextResponse.json(
          { error: 'Unsupported URL — could not find m3u8 stream' },
          { status: 404 }
        )
      }
    }

    const m3u8 = extractM3u8FromCdnlivetv(cdnlivetvHtml)
    if (!m3u8) {
      return NextResponse.json(
        { error: 'Could not extract m3u8 URL from cdnlivetv.tv page' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      {
        m3u8,
        channelName: extractChannelName(cdnlivetvHtml),
        source: cdnlivetvUrl,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=30, s-maxage=30',
        },
      }
    )
  } catch (error) {
    console.error('extract-m3u8 error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
