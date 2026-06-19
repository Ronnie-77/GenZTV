import { NextRequest, NextResponse } from 'next/server'

// GET /api/iframe-proxy?url=ENCODED_URL
// Fetches an iframe URL, neutralizes ad scripts, injects popup-blocking &
// auto-unmute scripts, then serves the sanitized HTML.
//
// Ad-blocking strategy (3 layers):
//   1. SERVER-SIDE: strip <script>/<iframe> tags whose src matches known ad
//      networks — the ad code never loads at all. Most reliable.
//   2. CSS INJECTION: a <style> block hides common ad-overlay selectors with
//      display:none !important. Applies instantly to all matching elements,
//      even ones created later by surviving scripts.
//   3. CLIENT-SIDE JS: window.open override, URL interception, element removal
//      via MutationObserver — catches anything the first two layers miss.

// ── Known ad / tracker / popup network domains ──
// Scripts/iframes whose src matches one of these are stripped server-side.
const AD_DOMAIN_PATTERNS = [
  /adsterra/i, /propellerads/i, /propeller/i, /monetag/i,
  /popads/i, /popcash/i, /popunder/i, /clickadu/i, /hilltopads/i,
  /clicksgear/i, /recreativ/i, /profitable/i, /bidvertiser/i,
  /infolinks/i, /chitika/i, /kontera/i, /vibrantmedia/i,
  /highperformanceformat/i, /betterads/i, /pushnotification/i,
  /notification[\.-]?subscri/i, /subscri/i,
  /aclib/i, /acscdn/i, /adskeeper/i, /mgid/i, /revcontent/i,
  /taboola/i, /outbrain/i, /exoclick/i, /exosrv/i, /juicyads/i,
  /trafficjunky/i, /adspyglass/i, /adsupply/i, /adsterra/i,
  /histats/i, /statcounter/i, /googletagmanager/i, /googlesyndication/i,
  /doubleclick/i, /adservice\.google/i, /amazon-adsystem/i,
  /facebook\.net\/.*\/beacon/i, /connect\.facebook\.net\/.*\/sdk/i,
  /scorecardresearch/i, /quantserve/i, /comscore/i, /chartbeat/i,
  /hotjar/i, /clarity\.ms/i, /yandex\.ru\/metric/i, /mc\.yandex/i,
  /onesignal/i, /webpushr/i, /sendpulse/i, /izooto/i, /pushcrew/i,
  /adblocker/i, /adrecover/i, /adunblock/i, /blockadblock/i,
  /anti[\.-]?adblock/i,
  // Rotating ad CDN hostnames used by free-plan streaming embeds
  // (e.g. ntv.cx → cdnlivetv.tv loads ads from these short random
  // subdomains). These are virtually never legitimate CDNs.
  /hubeamily/i, /trovesleepit/i, /amplepreparation/i, /easyleaving/i,
  /fastlymoving/i, /readyfunction/i, /quicklyuseful/i, /suddenorigin/i,
  /differenttree/i, /possibleplayer/i, /novemberprice/i, /decembereffect/i,
]

// True if a URL string points to a known ad/tracker network.
function isAdDomain(url: string): boolean {
  if (!url) return false
  return AD_DOMAIN_PATTERNS.some((p) => p.test(url))
}

// ── CSS that hides common in-page ad overlays ──
// Injected as a <style> tag in <head>. Uses !important so it wins over
// inline styles set by the ad scripts. Targets only ad-specific patterns —
// never matches video player elements (video, .player, .jw-, .clappr, .vjs-, .shaka-).
const AD_HIDE_CSS = `
<style data-genztv-adblock="css">
/* ── Ad containers & overlays ── */
div[id^="ad-"], div[id^="ads-"], div[id^="ad_"], div[id^="ads_"],
div[id$="-ad"], div[id$="-ads"], div[id*="bannerad" i], div[id*="adbanner" i],
div[id*="adcontainer" i], div[id*="adwrapper" i], div[id*="adoverlay" i],
div[class*="ad-banner" i], div[class*="ad-overlay" i], div[class*="ad-wrapper" i],
div[class*="ad-container" i], div[class*="ad_container" i],
div[class*="banner-ad" i], div[class*="overlay-ad" i],
div[class*="adcontainer" i], div[class*="adwrapper" i], div[class*="adoverlay" i],
div[class*="ad-slot" i], div[class*="adslot" i], div[class*="adslot" i],
div[class*="adsbox" i], div[class*="ad-box" i], div[class*="adbox" i],
div[class*="advert" i], div[class*="advertisement" i],
div[class*="promoted" i], div[class*="sponsor" i],
/* ── Popunder / popup layers ── */
div[class*="popunder" i], div[id*="popunder" i],
div[class*="popup-ad" i], div[id*="popup-ad" i],
div[class*="pop-ad" i], div[id*="popad" i],
div[class*="interstitial" i], div[id*="interstitial" i],
/* ── Social bar / push prompt / notification overlays ── */
div[class*="social-bar" i], div[id*="social-bar" i],
div[class*="push-notification" i], div[id*="push-notification" i],
div[class*="push-prompt" i], div[id*="push-prompt" i],
div[class*="notif" i][class*="subscribe" i],
div[class*="subscribe" i][class*="popup" i],
/* ── Known ad-network specific ── */
div[class*="clickadu" i], div[id*="clickadu" i],
div[class*="highperformanceformat" i], div[id*="highperformanceformat" i],
div[class*="betterads" i], div[id*="betterads" i],
div[class*="monetag" i], div[id*="monetag" i],
div[class*="adsterra" i], div[id*="adsterra" i],
div[class*="propeller" i], div[id*="propeller" i],
div[class*="popads" i], div[id*="popads" i],
div[class*="recreativ" i], div[id*="recreativ" i],
/* ── Google / standard ad units ── */
ins.adsbygoogle, ins.adslot, ins.ads,
div[id^="google_ads"], div[id^="div-gpt-ad"],
div[id^="google_ad_"], iframe[id^="google_ads_"],
iframe[src*="googlesyndication" i], iframe[src*="doubleclick" i],
iframe[src*="amazon-adsystem" i], iframe[src*="adsterra" i],
iframe[src*="propellerads" i], iframe[src*="monetag" i],
iframe[src*="popads" i], iframe[src*="popcash" i],
iframe[src*="clickadu" i], iframe[src*="hilltopads" i],
iframe[src*="exoclick" i], iframe[src*="trafficjunky" i],
iframe[src*="taboola" i], iframe[src*="outbrain" i],
iframe[src*="mgid" i], iframe[src*="adskeeper" i],
/* ── "Skip ad" / countdown overlays (visible ad creatives) ── */
div[class*="skip-ad" i], div[class*="skipad" i],
div[class*="ad-countdown" i], div[class*="countdown-ad" i],
/* ── Floating / fixed-position ad bars ── */
div[style*="position:fixed"][class*="ad" i],
div[style*="position: fixed"][class*="ad" i],
div[style*="position:fixed"][id*="ad" i],
div[style*="position: fixed"][id*="ad" i] {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  width: 0 !important;
  height: 0 !important;
  max-height: 0 !important;
  max-width: 0 !important;
  overflow: hidden !important;
  pointer-events: none !important;
  z-index: -1 !important;
}
</style>
`

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

    // Fetch the original content
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        Referer: parsedUrl.origin + '/',
      },
      redirect: 'follow',
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch: ${response.status}` },
        { status: response.status }
      )
    }

    let html = await response.text()

    // ── Sanitize the HTML ──

    // 1. Neutralize aclib ad calls — replace the call with a no-op
    html = html.replace(
      /aclib\.runPop\s*\(\s*\{[^}]*\}\s*\)\s*;?/gi,
      '/* ad-blocked */'
    )
    html = html.replace(
      /(<script\b[^>]*>)\s*(var\s+aclib|aclib\s*=)/gi,
      '$1/* ad-blocked: aclib = {} */ var aclib = {runPop:function(){}};'
    )

    // 2. Neutralize Histats tracking — strip the entire inline script block,
    //    the <noscript> fallback, and the HTML comments around it.
    html = html.replace(
      /<!--\s*Histats\.com\s+START[\s\S]*?Histats\.com\s+END\s*-->\s*/gi,
      ''
    )
    html = html.replace(
      /<script\b[^>]*>\s*var\s+_Hasync[\s\S]*?<\/script>\s*<noscript>[\s\S]*?histats\.com[\s\S]*?<\/noscript>\s*/gi,
      ''
    )
    // Fallback: any remaining script block that pushes to _Hasync or
    // injects an s10.histats.com script tag.
    html = html.replace(
      /<script\b[^>]*>([\s\S]*?)<\/script>/gi,
      (match, body) =>
        /_Hasync|histats\.com|s10\.histats/i.test(body)
          ? '<!-- histats-blocked -->'
          : match
    )
    html = html.replace(
      /<noscript>[\s\S]*?histats\.com[\s\S]*?<\/noscript>/gi,
      ''
    )

    // 2.5 ROTATING-CDN AD-SCRIPT HEURISTIC — strip any external script that
    //     is BOTH `async` AND `data-cfasync="false"`. This combination is
    //     used by Cloudflare-rocket-loader-aware ad/malicious scripts (e.g.
    //     fw.hubeamily.com, zq.trovesleepit.com on free-plan streaming
    //     embeds) and never by legitimate libraries. Strips them before the
    //     domain-pattern check so newly-spawned rotating hostnames are also
    //     caught.
    html = html.replace(
      /<script\b[^>]*\bdata-cfasync=["']false["'][^>]*\basync\b[^>]*>\s*<\/script>/gi,
      '<!-- ad-cfasync-async-blocked -->'
    )
    html = html.replace(
      /<script\b[^>]*\basync\b[^>]*\bdata-cfasync=["']false["'][^>]*>\s*<\/script>/gi,
      '<!-- ad-cfasync-async-blocked -->'
    )

    // 3. Remove the anti-iframe-busting redirect
    html = html.replace(
      /<script[^>]*>\s*if\s*\(\s*window\s*==\s*window\.top\s*\)[\s\S]*?<\/script>/gi,
      ''
    )

    // 3.5 SERVER-SIDE AD-SCRIPT STRIPPING — remove <script src="..."> tags
    //     whose src points to a known ad/tracker network. The ad code never
    //     loads, so it can never create overlay ads. This is the strongest
    //     layer because it runs before the browser executes anything.
    html = html.replace(
      /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi,
      (match, src) => (isAdDomain(src) ? '<!-- ad-script-blocked: ' + src + ' -->' : match)
    )

    // 3.6 SERVER-SIDE AD-IFRAME STRIPPING — remove <iframe src="..."> whose
    //     src points to a known ad network (banner/popup ad iframes).
    html = html.replace(
      /<iframe\b[^>]*\bsrc=["']([^"']+)["'][^>]*>[\s\S]*?<\/iframe>/gi,
      (match, src) => (isAdDomain(src) ? '<!-- ad-iframe-blocked -->' : match)
    )
    // Self-closing / attribute-only iframes (no closing tag)
    html = html.replace(
      /<iframe\b[^>]*\bsrc=["']([^"']+)["'][^>]*\/?>/gi,
      (match, src) => (isAdDomain(src) ? '<!-- ad-iframe-blocked -->' : match)
    )

    // 3.7 STRIP INLINE ad-init scripts that call known popup/popunder APIs.
    //     Catches inline <script> blocks (no src) that invoke aclib.runPop,
    //     popads, popunder, etc. directly.
    html = html.replace(
      /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi,
      (match, body) => {
        if (/aclib\.runPop|popunder|popads|popcash|hilltopads|clickadu|adsterra|propeller/i.test(body)) {
          return '<!-- ad-inline-blocked -->'
        }
        return match
      }
    )

    // 4. Add <base> tag for relative URL resolution (if not already present)
    if (!html.includes('<base')) {
      const baseTag = `<base href="${parsedUrl.origin}/">`
      html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`)
    }

    // 4.5 RECURSIVE IFRAME PROXYING — rewrite any inner <iframe src="https://...">
    //     to load through this same /api/iframe-proxy endpoint. This is the
    //     key fix for wrapper-style embeds (e.g. ntv.cx → cdnlivetv.tv) where
    //     the OUTER page is sanitized but the INNER iframe is loaded directly
    //     by the browser and would otherwise still show its own ads.
    //     Depth-limited to 3 to prevent infinite loops.
    const proxyDepth = Math.min(
      parseInt(req.nextUrl.searchParams.get('depth') || '0', 10) || 0,
      3
    )
    if (proxyDepth < 3) {
      const ourOrigin = req.nextUrl.origin
      // Decode HTML entities in the captured src attribute value. The regex
      // below extracts the raw attribute string which may contain HTML
      // entities like &amp; &lt; &gt; &quot; &#39; — the browser would decode
      // these when actually loading the iframe, so we must do the same before
      // encoding the URL for our recursive proxy call. Otherwise the upstream
      // server sees literal "&amp;code=gb" instead of "&code=gb" and rejects
      // the request (e.g. cdnlivetv.tv returns 400).
      const decodeHtmlEntities = (s: string): string =>
        s
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/&quot;/gi, '"')
          .replace(/&#39;/gi, "'")
          .replace(/&#x27;/gi, "'")
          .replace(/&apos;/gi, "'")
      const rewriteIframe = (match: string, pre: string, src: string, post: string) => {
        const decodedSrc = decodeHtmlEntities(src)
        // Skip iframes that already point at our proxy
        if (decodedSrc.includes('/api/iframe-proxy')) return match
        // Skip ad-domain iframes (already stripped earlier, but be safe)
        if (isAdDomain(decodedSrc)) return '<!-- ad-iframe-blocked-rewrite -->'
        // Skip non-http(s) iframes (about:blank, javascript:, data:, etc.)
        if (!/^https?:\/\//i.test(decodedSrc)) return match
        const proxiedSrc = `${ourOrigin}/api/iframe-proxy?url=${encodeURIComponent(decodedSrc)}&depth=${proxyDepth + 1}`
        return `<iframe${pre} src="${proxiedSrc}"${post}>`
      }
      // Paired: <iframe ... src="..." ...>...</iframe>
      html = html.replace(
        /<iframe\b([^>]*)\bsrc=["'](https?:\/\/[^"']+)["']([^>]*)>[\s\S]*?<\/iframe>/gi,
        (m, pre, src, post) => rewriteIframe(m, pre, src, post)
      )
      // Self-closing / attribute-only: <iframe ... src="..." ...>
      html = html.replace(
        /<iframe\b([^>]*)\bsrc=["'](https?:\/\/[^"']+)["']([^>]*)\/?>/gi,
        (m, pre, src, post) => rewriteIframe(m, pre, src, post)
      )
    }

    // 5. Inject ad-hiding CSS + popup-blocking + auto-unmute script BEFORE </head>
    const injectedScript = `
${AD_HIDE_CSS}
<script data-injected="genztv">
(function() {
  'use strict';

  // ── Block all popups from this page ──
  window.open = function() { return null; };
  try {
    Object.defineProperty(window, 'open', {
      value: function() { return null; },
      writable: false,
      configurable: false
    });
  } catch(e) {}

  // ── Intercept and block navigation to ad URLs ──
  var adPatterns = [
    /clicksgear/i, /adsterra/i, /propeller/i, /popunder/i,
    /pushnotification/i, /highperformanceformat/i, /betterads/i,
    /adblocker/i, /notification.*subscribe/i, /subscri/i,
    /popads/i, /popcash/i, /clickadu/i, /hilltopads/i,
    /monetag/i, /profitable/i, /recreativ/i,
    /exoclick/i, /exosrv/i, /juicyads/i, /trafficjunky/i,
    /adskeeper/i, /mgid/i, /revcontent/i, /bidvertiser/i,
    /infolinks/i, /taboola/i, /outbrain/i,
    /googlesyndication/i, /doubleclick/i, /amazon-adsystem/i,
    /scorecardresearch/i, /quantserve/i, /comscore/i,
    /onesignal/i, /webpushr/i, /sendpulse/i, /izooto/i,
    // Rotating ad CDN hostnames used by free-plan streaming embeds
    /hubeamily/i, /trovesleepit/i, /amplepreparation/i,
    /easyleaving/i, /fastlymoving/i, /readyfunction/i,
    /quicklyuseful/i, /suddenorigin/i, /differenttree/i,
    /possibleplayer/i, /novemberprice/i, /decembereffect/i
  ];

  function isAdUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return adPatterns.some(function(p) { return p.test(url); });
  }

  // Intercept location changes
  try {
    var origAssign = window.location.assign;
    var origReplace = window.location.replace;
    window.location.assign = function(url) {
      if (isAdUrl(String(url))) return;
      return origAssign.call(window.location, url);
    };
    window.location.replace = function(url) {
      if (isAdUrl(String(url))) return;
      return origReplace.call(window.location, url);
    };
  } catch(e) {}

  // ── Block click-based ad redirects ──
  document.addEventListener('click', function(e) {
    var target = e.target.closest ? e.target.closest('a') : null;
    if (target) {
      var href = target.getAttribute('href') || '';
      if (isAdUrl(href) || target.target === '_blank') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    }
  }, true);

  document.addEventListener('touchstart', function(e) {
    var target = e.target.closest ? e.target.closest('a') : null;
    if (target) {
      var href = target.getAttribute('href') || '';
      if (isAdUrl(href) || target.target === '_blank') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    }
  }, true);

  // ── Auto-unmute video elements ──
  function tryUnmute() {
    try {
      var videos = document.querySelectorAll('video');
      videos.forEach(function(v) {
        if (v.muted) {
          v.muted = false;
          v.volume = 1;
          v.play().catch(function() {
            v.muted = true;
            v.play().catch(function() {});
          });
        }
      });

      var unmuteSelectors = [
        '[class*="unmute"]', '[class*="Unmute"]',
        '[aria-label*="unmute"]', '[aria-label*="Unmute"]',
        '[title*="unmute"]', '[title*="Unmute"]',
        '[data-unmute]', '.mute-btn', '.volume-btn', '.sound-btn',
        '[class*="volume"]', '[class*="Volume"]'
      ];
      unmuteSelectors.forEach(function(sel) {
        try {
          document.querySelectorAll(sel).forEach(function(btn) { btn.click(); });
        } catch(e) {}
      });

      // Try to unmute videos inside nested iframes (same-origin only)
      var iframes = document.querySelectorAll('iframe');
      iframes.forEach(function(iframe) {
        try {
          var doc = iframe.contentDocument;
          if (doc) {
            doc.querySelectorAll('video').forEach(function(v) {
              if (v.muted) {
                v.muted = false; v.volume = 1;
                v.play().catch(function() { v.muted = true; v.play().catch(function() {}); });
              }
            });
            unmuteSelectors.forEach(function(sel) {
              try { doc.querySelectorAll(sel).forEach(function(btn) { btn.click(); }); } catch(e) {}
            });
          }
        } catch(e) {}
      });
    } catch(e) {}
  }

  setTimeout(tryUnmute, 1000);
  setTimeout(tryUnmute, 2000);
  setTimeout(tryUnmute, 3500);
  setTimeout(tryUnmute, 5000);
  setTimeout(tryUnmute, 8000);

  function onFirstInteraction() {
    tryUnmute();
    setTimeout(tryUnmute, 500);
    setTimeout(tryUnmute, 1500);
    document.removeEventListener('click', onFirstInteraction);
    document.removeEventListener('touchstart', onFirstInteraction);
  }
  document.addEventListener('click', onFirstInteraction);
  document.addEventListener('touchstart', onFirstInteraction);

  // ── Remove ad elements (expanded) ──
  // CSS already hides most; this JS layer removes them from the DOM so they
  // can't steal clicks or run timers.
  var adSelectors = [
    // Generic ad containers
    '[class*="ad-container"]', '[class*="ad-wrapper"]', '[class*="ad-overlay"]',
    '[id*="ad-container"]', '[id*="ad-wrapper"]', '[id*="ad-overlay"]',
    '[class*="ad-container" i]', '[class*="ad-wrapper" i]', '[class*="ad-overlay" i]',
    '[class*="adcontainer" i]', '[class*="adwrapper" i]', '[class*="adoverlay" i]',
    '[class*="banner-ad" i]', '[class*="overlay-ad" i]', '[class*="ad-banner" i]',
    // Popups / popunders
    '[class*="popup"]', '[class*="overlay-ad"]', '[class*="popunder" i]',
    '[id*="popunder" i]', '[class*="interstitial" i]', '[id*="interstitial" i]',
    // Google
    'ins.adsbygoogle', 'ins.adslot', 'ins.ads',
    'div[id^="google_ads"]', 'div[id^="div-gpt-ad"]', 'div[id^="google_ad_"]',
    'iframe[id^="google_ads_"]',
    // Known networks
    '[class*="social-bar" i]', '[id*="social-bar" i]',
    '[class*="push-notification" i]', '[id*="push-notification" i]',
    '[class*="clickadu" i]', '[id*="clickadu" i]',
    '[class*="highperformanceformat" i]', '[id*="highperformanceformat" i]',
    '[class*="betterads" i]', '[id*="betterads" i]',
    '[class*="monetag" i]', '[class*="adsterra" i]', '[class*="propeller" i]',
    '[class*="popads" i]', '[class*="recreativ" i]',
    // Floating ad bars
    'div[style*="position:fixed"][class*="ad" i]',
    'div[style*="position: fixed"][class*="ad" i]',
    // Skip-ad / countdown
    '[class*="skip-ad" i]', '[class*="ad-countdown" i]'
  ];
  function removeAds() {
    adSelectors.forEach(function(sel) {
      try {
        document.querySelectorAll(sel).forEach(function(el) {
          // Don't remove <video> or player containers — only ad creatives
          if (el.tagName !== 'VIDEO' && !el.querySelector('video')) {
            el.remove();
          } else if (el.tagName !== 'VIDEO') {
            // It contains a video but is an ad wrapper — just hide it via
            // visibility rather than removing, to avoid killing the video.
            el.style.setProperty('display', 'none', 'important');
          }
        });
      } catch(e) {}
    });
  }

  setTimeout(removeAds, 500);
  setTimeout(removeAds, 2000);
  setTimeout(removeAds, 5000);
  setTimeout(removeAds, 10000);

  // MutationObserver to remove dynamically added ad elements
  var observer = new MutationObserver(function() { removeAds(); });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      observer.observe(document.body, { childList: true, subtree: true });
      removeAds();
    });
  }
})();
</script>
`

    html = html.replace('</head>', injectedScript + '\n</head>')

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=30, s-maxage=30',
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy':
          "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-src *; frame-ancestors *;",
      },
    })
  } catch (error) {
    console.error('Iframe proxy error:', error)
    return NextResponse.json(
      { error: 'Failed to proxy iframe content' },
      { status: 500 }
    )
  }
}
