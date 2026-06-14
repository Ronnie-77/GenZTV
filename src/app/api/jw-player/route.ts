import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  const proxyUrl = url ? `/api/stream-proxy?url=${encodeURIComponent(url)}` : ''

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
  @keyframes spin { to { transform: rotate(360deg); } }
  .error-msg { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: rgba(255,255,255,0.7); font-family: sans-serif; font-size: 13px; text-align: center; padding: 20px; max-width: 80%; }
  .retry-btn { margin-top: 12px; padding: 8px 20px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; color: #fff; cursor: pointer; font-size: 13px; }
  .retry-btn:hover { background: rgba(255,255,255,0.25); }
</style>
</head>
<body>
<div id="player-container">
  <video id="video" playsinline autoplay></video>
  <div id="loading" class="loading">
    <div class="spinner"></div>
  </div>
  <div id="error" class="error-msg" style="display:none;"></div>
</div>

<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<script>
(function() {
  var video = document.getElementById('video');
  var loadingEl = document.getElementById('loading');
  var errorEl = document.getElementById('error');
  var directUrl = ${JSON.stringify(url || '')};
  var proxyUrl = ${JSON.stringify(proxyUrl)};
  var triedDirect = false;
  var triedProxy = false;
  var hls = null;

  function hideLoading() {
    loadingEl.style.display = 'none';
  }
  function showError(msg) {
    hideLoading();
    errorEl.style.display = 'block';
    errorEl.innerHTML = msg + '<br><button class="retry-btn" onclick="location.reload()">Retry</button>';
  }

  function destroyHls() {
    if (hls) {
      hls.destroy();
      hls = null;
    }
  }

  function initHls(url, isDirect) {
    destroyHls();

    if (!url) {
      showError('No stream URL provided');
      return;
    }

    // Try native HLS first (Safari/iOS)
    if (video.canPlayType('application/vnd.apple.mpegurl') && !isDirect) {
      video.src = url;
      video.addEventListener('loadedmetadata', function() {
        hideLoading();
        video.play().catch(function(){});
      });
      video.addEventListener('error', function() {
        // Native HLS failed, try with hls.js through proxy
        if (!triedProxy && proxyUrl) {
          triedProxy = true;
          video.src = proxyUrl;
          video.play().catch(function(){});
        }
      });
      video.play().catch(function(){});
      return;
    }

    if (!Hls.isSupported()) {
      // Try native as last resort
      video.src = url;
      video.addEventListener('loadedmetadata', function() {
        hideLoading();
        video.play().catch(function(){});
      });
      video.play().catch(function(){});
      return;
    }

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

      // More lenient than default — longer timeouts, more retries
      fragLoadingMaxRetry: 4,
      fragLoadingMaxRetryTimeout: 16000,
      fragLoadingTimeOut: 16000,
      manifestLoadingMaxRetry: 3,
      manifestLoadingMaxRetryTimeout: 12000,
      manifestLoadingTimeOut: 12000,
      levelLoadingMaxRetry: 3,
      levelLoadingMaxRetryTimeout: 12000,
      levelLoadingTimeOut: 12000,

      startLevel: -1,

      xhrSetup: function(xhr, reqUrl) {
        if (!reqUrl.includes('/api/stream-proxy')) {
          try { xhr.setRequestHeader('User-Agent', 'VLC/3.0.18 LibVLC/3.0.18'); } catch(e) {}
        }
      },
    });

    hls.loadSource(url);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, function() {
      hideLoading();
      video.play().catch(function(){});
    });

    hls.on(Hls.Events.ERROR, function(event, data) {
      if (!data.fatal) return;

      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        // Network error — try fallback
        if (!isDirect && !triedDirect && directUrl) {
          // Was using proxy, try direct
          console.log('[jw-player] Proxy failed, trying direct URL');
          triedDirect = true;
          initHls(directUrl, true);
        } else if (isDirect && !triedProxy && proxyUrl && url !== proxyUrl) {
          // Was using direct, try proxy
          console.log('[jw-player] Direct failed, trying proxy URL');
          triedProxy = true;
          initHls(proxyUrl, false);
        } else {
          // Both failed
          hls.recoverMediaError();
          setTimeout(function() {
            if (hls) {
              showError('Stream unavailable. The server may be offline.');
            }
          }, 5000);
        }
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        console.log('[jw-player] Media error, recovering...');
        hls.recoverMediaError();
      } else {
        showError('Stream format not supported.');
        destroyHls();
      }
    });

    // Auto-retry on stall
    video.addEventListener('stalled', function() {
      if (hls) {
        console.log('[jw-player] Video stalled, attempting recovery');
      }
    });

    // Handle video errors
    video.addEventListener('error', function() {
      if (!isDirect && !triedDirect && directUrl) {
        triedDirect = true;
        initHls(directUrl, true);
      } else if (!triedProxy && proxyUrl) {
        triedProxy = true;
        initHls(proxyUrl, false);
      }
    });
  }

  // Start with direct URL first (opposite of main player which starts with proxy)
  // This is the key difference — JW Player approach tries direct first
  if (directUrl) {
    triedDirect = true;
    initHls(directUrl, true);
  } else if (proxyUrl) {
    triedProxy = true;
    initHls(proxyUrl, false);
  } else {
    showError('No stream URL provided');
  }

  // Handle fullscreen
  video.addEventListener('dblclick', function() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(function(){});
    }
  });

  // Click to play/pause
  video.addEventListener('click', function() {
    if (video.paused) {
      video.play().catch(function(){});
    } else {
      video.pause();
    }
  });
})();
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
