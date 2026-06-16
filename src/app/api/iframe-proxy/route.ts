import { NextRequest, NextResponse } from 'next/server'

// GET /api/iframe-proxy?url=ENCODED_URL
// Fetches an iframe URL, neutralizes ad scripts, injects popup-blocking &
// auto-unmute scripts, then serves the sanitized HTML.
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
    //    Be careful to only target the specific script block containing aclib
    html = html.replace(
      /aclib\.runPop\s*\(\s*\{[^}]*\}\s*\)\s*;?/gi,
      '/* ad-blocked */'
    )
    // If aclib itself is loaded via a script, prevent it from defining
    html = html.replace(
      /(<script\b[^>]*>)\s*(var\s+aclib|aclib\s*=)/gi,
      '$1/* ad-blocked: aclib = {} */ var aclib = {runPop:function(){}};'
    )

    // 2. Neutralize Histats tracking — replace with no-op
    html = html.replace(
      /var\s+_Hasync\s*=\s*_Hasync\s*\|\|\s*\[\]\s*;/gi,
      '/* tracker-blocked */ var _Hasync = {push:function(){}};'
    )
    html = html.replace(
      /_Hasync\.push\([^)]*\)\s*;/gi,
      '/* tracker-blocked */;'
    )
    // Remove the Histats counter image/noscript
    html = html.replace(
      /<!--\s*Histats\.com\s+START[\s\S]*?Histats\.com\s+END\s*-->/gi,
      ''
    )
    html = html.replace(
      /<noscript>[\s\S]*?histats\.com[\s\S]*?<\/noscript>/gi,
      ''
    )

    // 3. Remove the anti-iframe-busting redirect
    //    (since we're loading this in our own iframe via proxy)
    html = html.replace(
      /<script[^>]*>\s*if\s*\(\s*window\s*==\s*window\.top\s*\)[\s\S]*?<\/script>/gi,
      ''
    )

    // 4. Add <base> tag for relative URL resolution (if not already present)
    if (!html.includes('<base')) {
      const baseTag = `<base href="${parsedUrl.origin}/">`
      html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`)
    }

    // 5. Inject our popup-blocking + auto-unmute script BEFORE </head>
    const injectedScript = `
<script data-injected="genztv">
(function() {
  'use strict';

  // ── Block all popups from this page ──
  // Override window.open before any other script runs
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
    /monetag/i, /profitable/i, /recreativ/i
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
      // Unmute videos in this document
      var videos = document.querySelectorAll('video');
      videos.forEach(function(v) {
        if (v.muted) {
          v.muted = false;
          v.volume = 1;
          v.play().catch(function() {
            // Browser requires interaction first — play muted, unmute on click
            v.muted = true;
            v.play().catch(function() {});
          });
        }
      });

      // Click unmute buttons
      var unmuteSelectors = [
        '[class*="unmute"]', '[class*="Unmute"]',
        '[aria-label*="unmute"]', '[aria-label*="Unmute"]',
        '[title*="unmute"]', '[title*="Unmute"]',
        '[data-unmute]', '.mute-btn', '.volume-btn', '.sound-btn',
        '[class*="volume"]', '[class*="Volume"]'
      ];
      unmuteSelectors.forEach(function(sel) {
        try {
          document.querySelectorAll(sel).forEach(function(btn) {
            btn.click();
          });
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
                v.muted = false;
                v.volume = 1;
                v.play().catch(function() {
                  v.muted = true;
                  v.play().catch(function() {});
                });
              }
            });
            unmuteSelectors.forEach(function(sel) {
              try {
                doc.querySelectorAll(sel).forEach(function(btn) {
                  btn.click();
                });
              } catch(e) {}
            });
          }
        } catch(e) {
          // Cross-origin iframe — can't access
        }
      });
    } catch(e) {}
  }

  // Try auto-unmute at intervals
  setTimeout(tryUnmute, 1000);
  setTimeout(tryUnmute, 2000);
  setTimeout(tryUnmute, 3500);
  setTimeout(tryUnmute, 5000);
  setTimeout(tryUnmute, 8000);

  // Also try on first user interaction
  function onFirstInteraction() {
    tryUnmute();
    setTimeout(tryUnmute, 500);
    setTimeout(tryUnmute, 1500);
    document.removeEventListener('click', onFirstInteraction);
    document.removeEventListener('touchstart', onFirstInteraction);
  }
  document.addEventListener('click', onFirstInteraction);
  document.addEventListener('touchstart', onFirstInteraction);

  // ── Remove ad elements ──
  function removeAds() {
    var adSelectors = [
      '[class*="ad-container"]', '[class*="ad-wrapper"]',
      '[id*="ad-container"]', '[id*="ad-wrapper"]',
      '[class*="popup"]', '[class*="overlay-ad"]',
      'ins.adsbygoogle', 'div[id^="google_ads"]',
      '[class*="social-bar"]', '[class*="push-notification"]',
      '[class*="clickadu"]', '[class*="popunder"]'
    ];
    adSelectors.forEach(function(sel) {
      try {
        document.querySelectorAll(sel).forEach(function(el) {
          el.remove();
        });
      } catch(e) {}
    });
  }

  setTimeout(removeAds, 500);
  setTimeout(removeAds, 2000);
  setTimeout(removeAds, 5000);

  // MutationObserver to remove dynamically added ad elements
  var observer = new MutationObserver(function() {
    removeAds();
  });

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
