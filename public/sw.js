// GenZ TV Service Worker
// - Handles push notifications
// - Provides offline app-shell caching (network-first, cache fallback)
//   so the PWA can be installed and launched on Smart TVs / phones / PCs.
//
// CACHE VERSIONING: Bump CACHE_NAME whenever ad/player code changes
// significantly. Old caches are deleted on `activate`, which forces every
// returning client to fetch fresh JS on their next navigation. Without this,
// the cache-first static-asset policy below would serve stale DynamicAdSlot
// / VideoPlayer bundles forever — and an old sandbox policy (e.g.
// `allow-same-origin` on ad iframes) would keep hijacking iPhone Chrome even
// after a fix ships.

const CACHE_NAME = 'genztv-v4'
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/logo.svg',
  '/favicon.svg',
  '/favicon-dark.svg',
]

// Install event — pre-cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  )
  self.skipWaiting()
})

// Activate event — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  event.waitUntil(clients.claim())
})

// Fetch event — network-first for navigations AND for JS/CSS chunks (so code
// changes are picked up immediately), cache-first for other static assets.
self.addEventListener('fetch', (event) => {
  const req = event.request

  // Only handle GET
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Skip cross-origin requests (e.g. ad scripts, stream URLs, analytics)
  if (url.origin !== self.location.origin) return

  // Skip API requests (always go to network)
  if (url.pathname.startsWith('/api/')) return

  // For navigations: network-first, fall back to cached app shell
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Cache a copy of the latest navigation response
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/')))
    )
    return
  }

  // For JS / CSS / source-map chunks: network-first so code changes ship
  // immediately. Without this, an old DynamicAdSlot sandbox policy would
  // keep hijacking iPhone Chrome until the cache expired.
  const isCodeAsset =
    req.destination === 'script' ||
    req.destination === 'style' ||
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:js|mjs|css|ts|tsx|jsx|map)$/i.test(url.pathname)
  if (isCodeAsset) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (!res || res.status !== 200 || res.type !== 'basic') return res
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match(req).then((r) => r || fetch(req)))
    )
    return
  }

  // For other static assets (images, fonts, icons): cache-first.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req)
        .then((res) => {
          // Only cache successful, same-origin, basic responses
          if (!res || res.status !== 200 || res.type !== 'basic') return res
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {})
          return res
        })
        .catch(() => cached)
    })
  )
})

// Push event — handle incoming push notifications
self.addEventListener('push', (event) => {
  let data = {
    title: 'GenZ TV',
    body: 'New update available!',
    icon: '/logo.svg',
    url: '/',
    tag: 'genztv-notification',
  }

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() }
    } catch (e) {
      data.body = event.data.text() || data.body
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    // `image` is a larger banner shown below the title/body on most
    // platforms. We surface the team logo here too so that on Android
    // (which shows both icon and image) the team branding is prominent.
    image: data.image || data.icon,
    badge: '/logo.svg',
    tag: data.tag,
    data: {
      url: data.url,
    },
    vibrate: [100, 50, 100],
    actions: [
      { action: 'open', title: 'Watch Now' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  )
})

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const urlToOpen = event.notification.data?.url || '/'

  if (event.action === 'dismiss') return

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If there's already a window open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen)
          return client.focus()
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(urlToOpen)
    })
  )
})
