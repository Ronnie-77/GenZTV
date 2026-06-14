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

<script src="https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.7/hls.min.js"></script>
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
  var currentMode = ''; // 'native', 'direct', 'proxy'
  var fatalErrorCount = 0;
  var triedModes = {}; // Track which modes we've tried

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
  // STEP 1: Direct hls.js (like the user's working HTML file)
  // Simple config, NO custom headers, NO proxy
  // This works when: IPTV server sends CORS headers, or page is HTTP
  // ═══════════════════════════════════════════════════
  function tryDirectHls() {
    if (triedModes['direct']) { tryProxyHls(); return; }
    triedModes['direct'] = true;

    if (!Hls.isSupported()) {
      console.log('[jw-player] hls.js not supported, trying native');
      tryNativeHls();
      return;
    }

    currentMode = 'direct';
    setStatus('Connecting directly...');
    console.log('[jw-player] Step 1: Direct hls.js (no proxy, no custom headers)');

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
      abrBandWidthFactor: 0.95,
      abrBandWidthUpFactor: 0.7,
      abrMaxWithRealBitrate: true,

      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
      liveDurationInfinity: true,
      progressive: true,

      // Generous timeouts for IPTV servers
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

      // CRITICAL: NO custom headers for direct mode!
      // Custom headers trigger CORS preflight which IPTV servers can't handle
      xhrSetup: function(xhr, reqUrl) {
        // Only set User-Agent for proxy requests (same-origin, no CORS)
        if (reqUrl.includes('/api/stream-proxy')) {
          try { xhr.setRequestHeader('User-Agent', 'VLC/3.0.18 LibVLC/3.0.18'); } catch(e) {}
        }
      },
    });

    hls.loadSource(directUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, function() {
      console.log('[jw-player] Direct hls.js working!');
      notifyReady();
      video.play().catch(function(){});
    });

    hls.on(Hls.Events.ERROR, function(event, data) {
      if (!data.fatal) return;
      console.error('[jw-player] Direct error:', data.type, data.details);

      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        fatalErrorCount++;
        if (fatalErrorCount <= 3) {
          hls.recoverMediaError();
        } else {
          tryProxyHls();
        }
      } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        // Direct failed → try proxy
        console.log('[jw-player] Direct failed, trying proxy...');
        tryProxyHls();
      } else {
        tryProxyHls();
      }
    });
  }

  // ═══════════════════════════════════════════════════
  // STEP 2: Proxy hls.js (server-side fetch)
  // Bypasses CORS but requires our server to reach the IPTV server
  // ═══════════════════════════════════════════════════
  function tryProxyHls() {
    if (triedModes['proxy']) { tryNativeHls(); return; }
    triedModes['proxy'] = true;

    if (!proxyUrl) {
      tryNativeHls();
      return;
    }

    if (!Hls.isSupported()) {
      tryNativeHls();
      return;
    }

    currentMode = 'proxy';
    setStatus('Trying proxy...');
    console.log('[jw-player] Step 2: Proxy hls.js');

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

      // Very generous timeouts for proxy
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
        if (reqUrl.includes('/api/stream-proxy')) {
          try { xhr.setRequestHeader('User-Agent', 'VLC/3.0.18 LibVLC/3.0.18'); } catch(e) {}
        }
      },
    });

    hls.loadSource(proxyUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, function() {
      console.log('[jw-player] Proxy hls.js working!');
      notifyReady();
      video.play().catch(function(){});
    });

    hls.on(Hls.Events.ERROR, function(event, data) {
      if (!data.fatal) return;
      console.error('[jw-player] Proxy error:', data.type, data.details);

      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        fatalErrorCount++;
        if (fatalErrorCount <= 3) {
          hls.recoverMediaError();
        } else {
          tryNativeHls();
        }
      } else {
        tryNativeHls();
      }
    });
  }

  // ═══════════════════════════════════════════════════
  // STEP 3: Native HLS (Safari/iOS)
  // No CORS needed — video element can load cross-origin media
  // ═══════════════════════════════════════════════════
  function tryNativeHls() {
    if (triedModes['native']) {
      showError('Stream unavailable — all playback methods failed.<br><small>Try opening the stream URL directly in a new browser tab.</small>');
      return;
    }
    triedModes['native'] = true;

    if (!video.canPlayType('application/vnd.apple.mpegurl')) {
      showError('Stream unavailable — browser cannot play this format.<br><small>Try on Safari/iOS or open the URL directly in a new tab.</small>');
      return;
    }

    currentMode = 'native';
    setStatus('Trying native HLS...');
    console.log('[jw-player] Step 3: Native HLS (Safari/iOS)');

    video.src = directUrl;

    var metadataHandler = function() {
      console.log('[jw-player] Native HLS working!');
      notifyReady();
      video.play().catch(function(){});
      video.removeEventListener('loadedmetadata', metadataHandler);
      video.removeEventListener('error', errorHandler);
      clearTimeout(timeout);
    };

    var errorHandler = function() {
      console.log('[jw-player] Native HLS failed');
      video.removeEventListener('loadedmetadata', metadataHandler);
      video.removeEventListener('error', errorHandler);
      video.removeAttribute('src');
      video.load();
      showError('Stream unavailable — the server may be offline or blocking connections.<br><small>Try opening the URL directly in a new browser tab.</small>');
    };

    var timeout = setTimeout(function() {
      console.log('[jw-player] Native HLS timeout (10s)');
      video.removeEventListener('loadedmetadata', metadataHandler);
      video.removeEventListener('error', errorHandler);
      video.removeAttribute('src');
      video.load();
      showError('Stream unavailable — connection timed out.<br><small>Try opening the URL directly in a new browser tab.</small>');
    }, 10000);

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
  // START: Try Direct → Proxy → Native
  // ═══════════════════════════════════════════════════
  if (!directUrl) {
    showError('No stream URL provided');
    return;
  }

  tryDirectHls();

  // ═══════════════════════════════════════════════════
  // Controls
  // ═══════════════════════════════════════════════════
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

  function showControls() {
    controlsEl.style.opacity = '1';
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(function() {
      controlsEl.style.opacity = '0';
    }, 3000);
  }

  video.addEventListener('mousemove', showControls);
  video.addEventListener('touchstart', showControls);

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
