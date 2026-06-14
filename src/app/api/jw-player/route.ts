import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  const proxyUrl = url ? `/api/stream-proxy?url=${encodeURIComponent(url)}&timeout=30000` : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Player</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; background: #000; overflow: hidden; }
  #player-container { width: 100%; height: 100%; position: relative; }
  video { width: 100%; height: 100%; object-fit: contain; background: #000; }
  .loading { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: rgba(255,255,255,0.6); font-family: sans-serif; font-size: 14px; text-align: center; pointer-events: none; }
  .spinner { width: 36px; height: 36px; border: 3px solid rgba(255,255,255,0.2); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 10px; }
  .status { font-size: 11px; margin-top: 8px; color: rgba(255,255,255,0.4); }
  @keyframes spin { to { transform: rotate(360deg); } }
  .error-msg { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: rgba(255,255,255,0.7); font-family: sans-serif; font-size: 13px; text-align: center; padding: 20px; max-width: 80%; }
  .retry-btn { margin-top: 12px; padding: 8px 20px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; color: #fff; cursor: pointer; font-size: 13px; }
  .retry-btn:hover { background: rgba(255,255,255,0.25); }
  .controls { position: absolute; bottom: 0; left: 0; right: 0; padding: 10px 15px; background: linear-gradient(transparent, rgba(0,0,0,0.7)); display: flex; justify-content: space-between; align-items: center; opacity: 0; transition: opacity 0.3s; }
  .controls:hover { opacity: 1; }
  .controls button { background: none; border: none; color: #fff; font-size: 13px; cursor: pointer; padding: 5px 10px; border-radius: 4px; }
  .controls button:hover { background: rgba(255,255,255,0.15); }
</style>
</head>
<body>
<div id="player-container">
  <video id="video" playsinline autoplay></video>
  <div id="loading" class="loading">
    <div class="spinner"></div>
    <div id="status" class="status"></div>
  </div>
  <div id="error" class="error-msg" style="display:none;"></div>
  <div class="controls" id="controls">
    <button id="btn-play" onclick="togglePlay()">⏸</button>
    <button id="btn-fs" onclick="toggleFullscreen()">⛶</button>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<script>
(function() {
  var video = document.getElementById('video');
  var loadingEl = document.getElementById('loading');
  var statusEl = document.getElementById('status');
  var errorEl = document.getElementById('error');
  var controlsEl = document.getElementById('controls');
  var directUrl = ${JSON.stringify(url || '')};
  var proxyUrl = ${JSON.stringify(proxyUrl)};
  var hls = null;
  var ready = false;
  var mode = ''; // 'native', 'direct', 'proxy'
  var fatalErrorCount = 0;

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function hideLoading() {
    loadingEl.style.display = 'none';
  }

  function showError(msg) {
    hideLoading();
    controlsEl.style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.innerHTML = msg + '<br><button class="retry-btn" onclick="location.reload()">Retry</button>';
    // Notify parent
    try { window.parent.postMessage({ type: 'jw-player-error', message: msg }, '*'); } catch(e) {}
  }

  function notifyReady() {
    if (ready) return;
    ready = true;
    hideLoading();
    controlsEl.style.opacity = '1';
    setTimeout(function() { controlsEl.style.opacity = '0'; }, 3000);
    try { window.parent.postMessage({ type: 'jw-player-ready' }, '*'); } catch(e) {}
  }

  function destroyHls() {
    if (hls) {
      hls.destroy();
      hls = null;
    }
  }

  // ═══════════════════════════════════════════════════
  // STEP 1: Try Native HLS (Safari/iOS)
  // Native HLS does NOT require CORS — video element can load cross-origin media
  // This works for ALL m3u8 URLs if the browser supports it
  // ═══════════════════════════════════════════════════
  function tryNativeHls() {
    if (!video.canPlayType('application/vnd.apple.mpegurl')) {
      console.log('[jw-player] Native HLS not supported, skipping');
      tryDirectHls();
      return;
    }

    mode = 'native';
    setStatus('Connecting...');
    console.log('[jw-player] Step 1: Trying native HLS with direct URL');

    video.src = directUrl;

    var metadataHandler = function() {
      console.log('[jw-player] ✅ Native HLS working!');
      notifyReady();
      video.play().catch(function(){});
      video.removeEventListener('loadedmetadata', metadataHandler);
      video.removeEventListener('error', errorHandler);
    };

    var errorHandler = function() {
      console.log('[jw-player] Native HLS failed, trying hls.js direct');
      video.removeEventListener('loadedmetadata', metadataHandler);
      video.removeEventListener('error', errorHandler);
      video.removeAttribute('src');
      video.load();
      tryDirectHls();
    };

    // Timeout — if native HLS doesn't fire loadedmetadata in 8s, move on
    var timeout = setTimeout(function() {
      console.log('[jw-player] Native HLS timeout (8s), trying hls.js');
      video.removeEventListener('loadedmetadata', metadataHandler);
      video.removeEventListener('error', errorHandler);
      video.removeAttribute('src');
      video.load();
      tryDirectHls();
    }, 8000);

    video.addEventListener('loadedmetadata', function() {
      clearTimeout(timeout);
      metadataHandler();
    });
    video.addEventListener('error', function() {
      clearTimeout(timeout);
      errorHandler();
    });

    video.play().catch(function(){});
  }

  // ═══════════════════════════════════════════════════
  // STEP 2: Try hls.js with DIRECT URL (no proxy)
  // Key: Do NOT add custom headers (like User-Agent) because
  // custom headers trigger CORS preflight which IPTV servers
  // can't handle. Let hls.js make simple CORS requests.
  // ═══════════════════════════════════════════════════
  function tryDirectHls() {
    if (!Hls.isSupported()) {
      console.log('[jw-player] hls.js not supported');
      tryProxyHls();
      return;
    }

    mode = 'direct';
    setStatus('Connecting directly...');
    console.log('[jw-player] Step 2: Trying hls.js with direct URL (no custom headers)');

    destroyHls();

    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
      maxBufferLength: 60,
      maxMaxBufferLength: 120,
      maxBufferSize: 120 * 1000000,
      maxBufferHole: 0.5,

      // ABR
      abrEwmaDefaultEstimate: 500000,
      abrBandWidthFactor: 0.95,
      abrBandWidthUpFactor: 0.7,
      abrMaxWithRealBitrate: true,

      // Live
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
      liveDurationInfinity: true,
      progressive: true,

      // Lenient timeouts for direct connection
      fragLoadingMaxRetry: 3,
      fragLoadingMaxRetryTimeout: 20000,
      fragLoadingTimeOut: 20000,
      manifestLoadingMaxRetry: 2,
      manifestLoadingMaxRetryTimeout: 15000,
      manifestLoadingTimeOut: 15000,
      levelLoadingMaxRetry: 2,
      levelLoadingMaxRetryTimeout: 15000,
      levelLoadingTimeOut: 15000,

      startLevel: -1,

      // CRITICAL: Do NOT add custom headers for direct requests!
      // Custom headers like User-Agent trigger CORS preflight (OPTIONS request)
      // Most IPTV servers don't handle OPTIONS, causing the request to fail
      // Only add headers for proxy requests (same-origin, no CORS needed)
      xhrSetup: function(xhr, reqUrl) {
        // Only set User-Agent for proxy requests (same-origin)
        if (reqUrl.includes('/api/stream-proxy')) {
          try { xhr.setRequestHeader('User-Agent', 'VLC/3.0.18 LibVLC/3.0.18'); } catch(e) {}
        }
        // For direct requests: no custom headers = no CORS preflight
      },
    });

    hls.loadSource(directUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, function() {
      console.log('[jw-player] ✅ Direct hls.js working!');
      notifyReady();
      video.play().catch(function(){});
    });

    hls.on(Hls.Events.ERROR, function(event, data) {
      if (!data.fatal) return;
      console.error('[jw-player] Direct hls.js error:', data.type, data.details);

      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        fatalErrorCount++;
        if (fatalErrorCount <= 3) {
          console.log('[jw-player] Media error recovery attempt ' + fatalErrorCount);
          hls.recoverMediaError();
        } else {
          showError('Media error — stream format not supported by this browser.');
        }
      } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        // Direct failed — try proxy
        console.log('[jw-player] Direct connection failed, trying proxy...');
        tryProxyHls();
      } else {
        showError('Stream error — try a different browser or check your connection.');
      }
    });
  }

  // ═══════════════════════════════════════════════════
  // STEP 3: Try hls.js with PROXY (server-side fetch)
  // This bypasses CORS but requires our server to reach the
  // IPTV server. Uses much longer timeout (30s) because
  // some IPTV servers are slow or our server might be far.
  // ═══════════════════════════════════════════════════
  function tryProxyHls() {
    if (!proxyUrl) {
      showError('Stream unavailable — server cannot reach this channel. Try on Safari/iOS for direct playback.');
      return;
    }

    if (!Hls.isSupported()) {
      // Try native with proxy URL as last resort
      mode = 'proxy-native';
      setStatus('Trying proxy...');
      video.src = proxyUrl;
      video.addEventListener('loadedmetadata', function() {
        notifyReady();
        video.play().catch(function(){});
      });
      video.addEventListener('error', function() {
        showError('Stream unavailable — could not connect to this channel.');
      });
      video.play().catch(function(){});
      return;
    }

    mode = 'proxy';
    setStatus('Trying proxy...');
    console.log('[jw-player] Step 3: Trying hls.js with proxy URL (30s timeout)');

    destroyHls();
    fatalErrorCount = 0;

    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
      maxBufferLength: 60,
      maxMaxBufferLength: 120,
      maxBufferSize: 120 * 1000000,
      maxBufferHole: 0.5,

      abrEwmaDefaultEstimate: 500000,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
      liveDurationInfinity: true,
      progressive: true,

      // Very generous timeouts for proxy — server might need time to reach IPTV server
      fragLoadingMaxRetry: 4,
      fragLoadingMaxRetryTimeout: 30000,
      fragLoadingTimeOut: 30000,
      manifestLoadingMaxRetry: 3,
      manifestLoadingMaxRetryTimeout: 30000,
      manifestLoadingTimeOut: 30000,
      levelLoadingMaxRetry: 3,
      levelLoadingMaxRetryTimeout: 30000,
      levelLoadingTimeOut: 30000,

      startLevel: -1,

      xhrSetup: function(xhr, reqUrl) {
        // Add VLC User-Agent for proxy requests (same-origin, no CORS issues)
        if (reqUrl.includes('/api/stream-proxy')) {
          try { xhr.setRequestHeader('User-Agent', 'VLC/3.0.18 LibVLC/3.0.18'); } catch(e) {}
        }
      },
    });

    hls.loadSource(proxyUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, function() {
      console.log('[jw-player] ✅ Proxy hls.js working!');
      notifyReady();
      video.play().catch(function(){});
    });

    hls.on(Hls.Events.ERROR, function(event, data) {
      if (!data.fatal) return;
      console.error('[jw-player] Proxy hls.js error:', data.type, data.details);

      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        fatalErrorCount++;
        if (fatalErrorCount <= 3) {
          hls.recoverMediaError();
        } else {
          showError('Media error — stream format not supported.');
        }
      } else {
        // All methods failed
        showError('Stream unavailable — server cannot reach this channel.<br><small>Tip: Try on Safari (Mac/iOS) for direct playback, or check if the channel is online.</small>');
      }
    });
  }

  // ═══════════════════════════════════════════════════
  // START: Try Native → Direct → Proxy
  // ═══════════════════════════════════════════════════
  if (!directUrl) {
    showError('No stream URL provided');
    return;
  }

  tryNativeHls();

  // ═══════════════════════════════════════════════════
  // Controls
  // ═══════════════════════════════════════════════════
  // Show/hide controls on tap
  var controlsTimeout;
  video.addEventListener('click', function(e) {
    if (!ready) return;
    e.preventDefault();
    if (video.paused) {
      video.play().catch(function(){});
    } else {
      video.pause();
    }
  });

  video.addEventListener('dblclick', function(e) {
    e.preventDefault();
    toggleFullscreen();
  });

  // Auto-hide controls
  function showControls() {
    controlsEl.style.opacity = '1';
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(function() {
      controlsEl.style.opacity = '0';
    }, 3000);
  }

  video.addEventListener('mousemove', showControls);
  video.addEventListener('touchstart', showControls);

  // Update play button
  video.addEventListener('play', function() {
    var btn = document.getElementById('btn-play');
    if (btn) btn.textContent = '⏸';
  });
  video.addEventListener('pause', function() {
    var btn = document.getElementById('btn-play');
    if (btn) btn.textContent = '▶';
  });
})();

function togglePlay() {
  var v = document.getElementById('video');
  if (v.paused) v.play().catch(function(){}); else v.pause();
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen().catch(function(){});
  }
}
</script>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
