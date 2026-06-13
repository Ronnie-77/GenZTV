import { NextRequest, NextResponse } from 'next/server'

// GET /api/iframe-proxy?url=ENCODED_URL
// Fetches an iframe URL, neutralizes ad scripts, injects popup-blocking,
// forced autoplay & auto-unmute scripts, then serves the sanitized HTML.
//
// Improvements:
// - Origin header sent matching upstream origin for better CDN compatibility
// - AbortController with 15s timeout for upstream requests
// - Better error handling and logging

// Upstream request timeout (ms)
const UPSTREAM_TIMEOUT = 15000

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  // Create AbortController for upstream timeout
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT)

  try {
    // Validate URL
    const parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: 'Invalid URL protocol' }, { status: 400 })
    }

    // Extract hash fragment from the original URL
    const originalHash = parsedUrl.hash || ''

    // Fetch the original content (hash is not sent to server, which is expected)
    const fetchUrl = url.split('#')[0] // Remove hash for the actual fetch
    console.log(`[iframe-proxy] Fetching: ${fetchUrl}`)

    let response: Response
    try {
      response = await fetch(fetchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          // Send Referer and Origin matching the upstream — many CDNs/streaming sites require these
          Referer: parsedUrl.origin + '/',
          Origin: parsedUrl.origin,
        },
        redirect: 'follow',
        signal: controller.signal,
      })
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : 'Unknown fetch error'
      console.error(`[iframe-proxy] Fetch failed for ${fetchUrl}: ${msg}`)
      if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
        return NextResponse.json(
          { error: `Upstream request timed out after ${UPSTREAM_TIMEOUT / 1000}s` },
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
      console.error(`[iframe-proxy] Upstream error ${response.status} for ${fetchUrl}: ${bodyText.slice(0, 200)}`)
      return NextResponse.json(
        { error: `Failed to fetch: ${response.status}`, detail: bodyText.slice(0, 500) },
        { status: response.status }
      )
    }

    let html = await response.text()
    console.log(`[iframe-proxy] Fetched ${html.length} bytes from ${fetchUrl}`)

    // ── Sanitize the HTML ──

    // 1. Neutralize aclib ad calls — replace the call with a no-op
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

    // 5. Inject hash fragment restoration script at the VERY beginning of <head>
    //    This ensures the embed page's JavaScript sees the correct hash (e.g. #player=clappr&autoplay=1)
    const hashScript = originalHash ? `
<script data-injected="genztv-hash">
// Restore original URL hash so embed players can read their config (e.g. #player=clappr&autoplay=1)
try { window.location.hash = ${JSON.stringify(originalHash)}; } catch(e) {}
</script>
` : ''

    // 6. Inject our popup-blocking + forced autoplay + auto-unmute script BEFORE </head>
    const injectedScript = `
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

  // ── Forced Autoplay + Auto-unmute ──
  // Strategy: Start muted (browsers allow muted autoplay), then unmute on user interaction.
  var hasUnmuted = false;

  function forceAutoplay(video) {
    if (!video || video._genzAutoplay) return;
    video._genzAutoplay = true;

    // Set attributes for autoplay
    video.setAttribute('autoplay', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.muted = true;
    video.volume = 1;

    // Try to play muted first (always allowed by browsers)
    var playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.then(function() {
        // Muted autoplay succeeded — now try to unmute
        if (!hasUnmuted) {
          tryUnmuteVideo(video);
        }
      }).catch(function() {
        // Even muted autoplay failed — try again shortly
        setTimeout(function() {
          video.muted = true;
          video.play().catch(function() {});
        }, 500);
      });
    }

    // Also listen for pause events and force resume (some embeds pause on load)
    video.addEventListener('pause', function onPause() {
      if (!hasUnmuted && video._genzAutoplay) {
        setTimeout(function() {
          if (video.paused && video._genzAutoplay) {
            video.muted = true;
            video.play().catch(function() {});
          }
        }, 200);
      }
    });

    // Watch for when video actually starts playing
    video.addEventListener('playing', function onPlaying() {
      video.removeEventListener('playing', onPlaying);
    });
  }

  function tryUnmuteVideo(video) {
    if (hasUnmuted) return;
    try {
      video.muted = false;
      video.volume = 1;
      var p = video.play();
      if (p !== undefined) {
        p.then(function() {
          hasUnmuted = true;
        }).catch(function() {
          // Browser requires interaction — stay muted, unmute on click
          video.muted = true;
          video.play().catch(function() {});
        });
      }
    } catch(e) {
      video.muted = true;
    }
  }

  function tryAutoplayAndUnmute() {
    try {
      // Find and force-play all video elements
      var videos = document.querySelectorAll('video');
      videos.forEach(function(v) {
        forceAutoplay(v);
      });

      // Click play buttons on embed players (Clappr, Video.js, etc.)
      var playSelectors = [
        '[class*="play"]', '[class*="Play"]',
        '[aria-label*="play"]', '[aria-label*="Play"]',
        '[title*="play"]', '[title*="Play"]',
        '[data-play]', '.play-btn', '.vjs-big-play-button',
        '.play-button', '[class*="play-btn"]',
        '[class*="PlayBtn"]', '[class*="playButton"]',
        'button[class*="play"]', 'div[class*="play-button"]'
      ];
      playSelectors.forEach(function(sel) {
        try {
          document.querySelectorAll(sel).forEach(function(btn) {
            if (!btn._genzClicked) {
              btn._genzClicked = true;
              btn.click();
            }
          });
        } catch(e) {}
      });

      // Click unmute buttons
      var unmuteSelectors = [
        '[class*="unmute"]', '[class*="Unmute"]',
        '[aria-label*="unmute"]', '[aria-label*="Unmute"]',
        '[title*="unmute"]', '[title*="Unmute"]',
        '[data-unmute]', '.mute-btn', '.volume-btn', '.sound-btn',
        '[class*="volume"]', '[class*="Volume"]',
        '.vjs-mute-control', '.vjs-volume-menu-button'
      ];
      unmuteSelectors.forEach(function(sel) {
        try {
          document.querySelectorAll(sel).forEach(function(btn) {
            btn.click();
          });
        } catch(e) {}
      });

      // Try to autoplay/unmute videos inside nested iframes (same-origin only)
      var iframes = document.querySelectorAll('iframe');
      iframes.forEach(function(iframe) {
        try {
          var doc = iframe.contentDocument;
          if (doc) {
            doc.querySelectorAll('video').forEach(function(v) {
              forceAutoplay(v);
            });
            playSelectors.forEach(function(sel) {
              try {
                doc.querySelectorAll(sel).forEach(function(btn) {
                  if (!btn._genzClicked) {
                    btn._genzClicked = true;
                    btn.click();
                  }
                });
              } catch(e) {}
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

  // ── MutationObserver: force autoplay on dynamically added video elements ──
  // Many embed players (Clappr, Video.js, etc.) create <video> elements dynamically.
  // We watch for them and force autoplay as soon as they appear.
  var autoplayObserver = new MutationObserver(function(mutations) {
    var foundVideo = false;
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeName === 'VIDEO') {
          foundVideo = true;
        } else if (node.querySelectorAll) {
          if (node.querySelectorAll('video').length > 0) {
            foundVideo = true;
          }
        }
      });
    });
    if (foundVideo) {
      // Small delay to let the player initialize the video element
      setTimeout(tryAutoplayAndUnmute, 100);
      setTimeout(tryAutoplayAndUnmute, 500);
    }
  });

  // Start observing as soon as DOM is ready
  function startAutoplayObserver() {
    if (document.body) {
      autoplayObserver.observe(document.body, { childList: true, subtree: true });
      // Also check for any existing videos
      tryAutoplayAndUnmute();
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        autoplayObserver.observe(document.body, { childList: true, subtree: true });
        tryAutoplayAndUnmute();
      });
    }
  }
  startAutoplayObserver();

  // Try autoplay at intervals (catches delayed player initialization)
  setTimeout(tryAutoplayAndUnmute, 500);
  setTimeout(tryAutoplayAndUnmute, 1000);
  setTimeout(tryAutoplayAndUnmute, 2000);
  setTimeout(tryAutoplayAndUnmute, 3500);
  setTimeout(tryAutoplayAndUnmute, 5000);
  setTimeout(tryAutoplayAndUnmute, 8000);
  setTimeout(tryAutoplayAndUnmute, 12000);

  // On first user interaction: unmute all videos
  function onFirstInteraction() {
    hasUnmuted = true;
    // Unmute all videos
    document.querySelectorAll('video').forEach(function(v) {
      v.muted = false;
      v.volume = 1;
      v.play().catch(function() {
        // If unmuted play fails, keep muted
        v.muted = true;
        v.play().catch(function() {});
      });
    });
    // Click unmute buttons
    var unmuteSelectors = [
      '[class*="unmute"]', '[class*="Unmute"]',
      '[aria-label*="unmute"]', '[aria-label*="Unmute"]',
      '[title*="unmute"]', '[title*="Unmute"]',
      '[data-unmute]', '.mute-btn', '.volume-btn', '.sound-btn',
      '[class*="volume"]', '[class*="Volume"]',
      '.vjs-mute-control', '.vjs-volume-menu-button'
    ];
    unmuteSelectors.forEach(function(sel) {
      try {
        document.querySelectorAll(sel).forEach(function(btn) { btn.click(); });
      } catch(e) {}
    });
    // Try nested iframes too
    document.querySelectorAll('iframe').forEach(function(iframe) {
      try {
        var doc = iframe.contentDocument;
        if (doc) {
          doc.querySelectorAll('video').forEach(function(v) {
            v.muted = false;
            v.volume = 1;
            v.play().catch(function() {});
          });
          unmuteSelectors.forEach(function(sel) {
            try { doc.querySelectorAll(sel).forEach(function(btn) { btn.click(); }); } catch(e) {}
          });
        }
      } catch(e) {}
    });
    tryAutoplayAndUnmute();
    setTimeout(tryAutoplayAndUnmute, 500);
    setTimeout(tryAutoplayAndUnmute, 1500);
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
  var adObserver = new MutationObserver(function() {
    removeAds();
  });

  if (document.body) {
    adObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      adObserver.observe(document.body, { childList: true, subtree: true });
      removeAds();
    });
  }
})();
</script>
`

    // Inject hash script at the beginning of <head> (before any other scripts)
    if (hashScript) {
      html = html.replace(/<head([^>]*)>/i, `<head$1>${hashScript}`)
    }

    // Inject main script before </head>
    html = html.replace('</head>', injectedScript + '\n</head>')

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=30, s-maxage=30',
        // Override X-Frame-Options and CSP to allow embedding in our iframe
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy':
          "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-src *; frame-ancestors *;",
      },
    })
  } catch (error) {
    console.error('[iframe-proxy] Unhandled error:', error)
    return NextResponse.json(
      { error: 'Failed to proxy iframe content', detail: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  } finally {
    clearTimeout(timeout)
  }
}
