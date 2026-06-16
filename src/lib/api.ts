// API helper functions for GenZ TV

const BASE = '/api'

/** Wrapper for admin API calls — auto-handles 401 (session expired) by dispatching event */
function adminFetch(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, {
    credentials: 'same-origin',
    ...options,
  }).then(res => {
    if (res.status === 401) {
      // Session expired — notify admin view to logout
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('admin:unauthorized', { detail: { status: 401 } }))
      }
    }
    return res
  })
}

// ============ Types ============

export interface Channel {
  id: string
  name: string
  logo: string
  category: string
  streamType: string
  streamUrl: string
  githubM3uPath: string
  language: string
  country: string
  tags: string
  isFeatured: boolean
  isActive: boolean
  viewCount: number
  createdAt: string
  updatedAt: string
}

export interface MatchStream {
  id: string
  matchId: string
  name: string
  channel: string
  type: string
  url: string
}

export interface Match {
  id: string
  title: string
  sport: string
  teamA: string
  teamALogo: string
  teamB: string
  teamBLogo: string
  league: string
  thumbnail: string
  startTime: string
  endTime: string | null
  status: string
  isFeatured: boolean
  createdAt: string
  updatedAt: string
  streams: MatchStream[]
}

export interface Category {
  id: string
  name: string
  icon: string
  color: string
  order: number
  channelCount: number
  createdAt: string
  updatedAt: string
}

export interface AppSettings {
  id: string
  appName: string
  logoUrl: string
  maintenanceMode: boolean
  featuredChannelId: string
  heroBannerText: string
  defaultQuality: string
  bannerAdScript: string
  socialBarAdScript: string
  customAdScripts: string  // JSON array of {id, name, script, position, enabled}
  adsEnabled: boolean
  homeAdsEnabled: boolean
  videoAdsEnabled: boolean
  apkUrl: string
}

// ============ Channels ============

export async function fetchChannels(params?: { category?: string; search?: string; featured?: boolean; includeInactive?: boolean }): Promise<Channel[]> {
  const searchParams = new URLSearchParams()
  if (params?.category) searchParams.set('category', params.category)
  if (params?.search) searchParams.set('search', params.search)
  if (params?.featured) searchParams.set('featured', 'true')
  if (params?.includeInactive) searchParams.set('active', 'all')
  const res = await fetch(`${BASE}/channels?${searchParams.toString()}`)
  if (!res.ok) throw new Error('Failed to fetch channels')
  return res.json()
}

export async function fetchChannel(id: string): Promise<Channel> {
  const res = await fetch(`${BASE}/channels/${id}`)
  if (!res.ok) throw new Error('Failed to fetch channel')
  return res.json()
}

export async function createChannel(data: Partial<Channel>): Promise<Channel> {
  const res = await adminFetch(`${BASE}/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create channel')
  return res.json()
}

export async function updateChannel(id: string, data: Partial<Channel>): Promise<Channel> {
  const res = await adminFetch(`${BASE}/channels/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update channel')
  return res.json()
}

export async function deleteChannel(id: string): Promise<void> {
  const res = await adminFetch(`${BASE}/channels/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete channel')
}

// ============ Matches ============

export async function fetchMatches(params?: { sport?: string; status?: string; featured?: boolean }): Promise<Match[]> {
  const searchParams = new URLSearchParams()
  if (params?.sport) searchParams.set('sport', params.sport)
  if (params?.status) searchParams.set('status', params.status)
  if (params?.featured) searchParams.set('featured', 'true')
  const res = await fetch(`${BASE}/matches?${searchParams.toString()}`)
  if (!res.ok) throw new Error('Failed to fetch matches')
  return res.json()
}

export async function fetchMatch(id: string): Promise<Match> {
  const res = await fetch(`${BASE}/matches/${id}`)
  if (!res.ok) throw new Error('Failed to fetch match')
  return res.json()
}

export async function createMatch(data: {
  sport?: string
  teamA: string
  teamALogo?: string
  teamB: string
  teamBLogo?: string
  league?: string
  thumbnail?: string
  startTime: string
  endTime?: string
  status?: string
  isFeatured?: boolean
  streams?: { name?: string; channel?: string; type?: string; url?: string }[]
}): Promise<Match> {
  const res = await adminFetch(`${BASE}/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create match')
  return res.json()
}

export async function updateMatch(id: string, data: Record<string, unknown>): Promise<Match> {
  const res = await adminFetch(`${BASE}/matches/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update match')
  return res.json()
}

export async function deleteMatch(id: string): Promise<void> {
  const res = await adminFetch(`${BASE}/matches/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete match')
}

// ============ Categories ============

export async function fetchCategories(): Promise<Category[]> {
  const res = await fetch(`${BASE}/categories`)
  if (!res.ok) throw new Error('Failed to fetch categories')
  return res.json()
}

export async function createCategory(data: Partial<Category>): Promise<Category> {
  const res = await adminFetch(`${BASE}/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create category')
  return res.json()
}

export async function updateCategory(id: string, data: Partial<Category>): Promise<Category> {
  const res = await adminFetch(`${BASE}/categories/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update category')
  return res.json()
}

export async function deleteCategory(id: string): Promise<void> {
  const res = await adminFetch(`${BASE}/categories/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete category')
}

// ============ Settings ============

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch(`${BASE}/settings`)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to fetch settings (HTTP ${res.status}): ${text || res.statusText}`)
  }
  return res.json()
}

export async function updateSettings(data: Partial<AppSettings>): Promise<AppSettings> {
  const res = await adminFetch(`${BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to update settings (HTTP ${res.status}): ${text || res.statusText}`)
  }
  return res.json()
}

// ============ M3U Parser ============

export async function parseM3U(url: string): Promise<{ channels: { name: string; logo: string; group: string; url: string }[]; total: number }> {
  const res = await adminFetch(`${BASE}/m3u-parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) throw new Error('Failed to parse M3U')
  return res.json()
}

// ============ File Import ============

export async function importFileContent(content: string, fileType: string): Promise<{ channels: { name: string; logo: string; group: string; url: string; language?: string; country?: string }[]; total: number }> {
  const res = await adminFetch(`${BASE}/channels/import-file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, fileType }),
  })
  if (!res.ok) throw new Error('Failed to parse import file')
  return res.json()
}

// ============ Seed ============

export async function seedDatabase(): Promise<Record<string, unknown>> {
  const res = await adminFetch(`${BASE}/seed`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to seed database')
  return res.json()
}

// ============ Push Notifications ============

export async function getVapidPublicKey(): Promise<string> {
  const res = await fetch(`${BASE}/push/vapid-key`)
  if (!res.ok) throw new Error('Failed to get VAPID key')
  const data = await res.json()
  return data.publicKey
}

export async function subscribePush(subscription: PushSubscriptionJSON): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  })
  if (!res.ok) throw new Error('Failed to subscribe')
  return res.json()
}

export async function unsubscribePush(endpoint: string): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/push/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })
  if (!res.ok) throw new Error('Failed to unsubscribe')
  return res.json()
}

export async function sendPushNotification(payload: {
  type?: 'new-match'
  match?: { id: string; title: string; sport: string; teamA: string; teamB: string; league?: string }
  title?: string
  body?: string
  url?: string
  tag?: string
}): Promise<{ sent: number; failed: number }> {
  const res = await adminFetch(`${BASE}/push/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to send notification')
  return res.json()
}

interface PushSubscriptionJSON {
  endpoint: string
  keys?: { p256dh?: string; auth?: string }
}

// ============ Push Subscription Count ============

export async function getPushSubscriberCount(): Promise<number> {
  const res = await fetch(`${BASE}/push/subscribers`)
  if (!res.ok) throw new Error('Failed to get subscriber count')
  const data = await res.json()
  return data.count
}

// ============ Match Status Sync ============

export async function syncMatchStatuses(): Promise<{ success: boolean; updatedToLive: number; updatedToEnded: number; totalUpdated: number }> {
  const res = await adminFetch(`${BASE}/matches/sync-statuses`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to sync match statuses')
  return res.json()
}
