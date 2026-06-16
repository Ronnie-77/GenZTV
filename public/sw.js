// GenZ TV Service Worker
// - Handles push notifications
// - Provides offline app-shell caching (network-first, cache fallback)
//   so the PWA can be installed and launched on Smart TVs / phones / PCs.

const CACHE_NAME = 'genztv-v2'
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

// Fetch event — network-first for navigations, cache-first for static assets
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

  // For static assets: cache-first, then network (and cache the response)
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
