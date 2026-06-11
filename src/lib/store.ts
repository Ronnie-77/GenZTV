import { create } from 'zustand'

export type PageName = 
  | 'home' 
  | 'live' 
  | 'watch' 
  | 'news' 
  | 'sports' 
  | 'cricket' 
  | 'football' 
  | 'entertainment' 
  | 'favorites' 
  | 'search'
  | 'admin'
  | 'more'

export type AdminPage = 
  | 'dashboard' 
  | 'channels' 
  | 'matches' 
  | 'categories' 
  | 'settings'

interface AppState {
  // Navigation
  currentPage: PageName
  setCurrentPage: (page: PageName) => void
  navigationHistory: PageName[]
  goBack: () => void
  
  // Watch page
  currentChannelId: string | null
  setCurrentChannelId: (id: string | null) => void
  
  // Admin
  adminPage: AdminPage
  setAdminPage: (page: AdminPage) => void
  isAdminAuth: boolean
  setIsAdminAuth: (auth: boolean) => void
  
  // Sidebar
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  
  // Search
  searchQuery: string
  setSearchQuery: (query: string) => void
  
  // Favorites (stored in localStorage)
  favorites: string[]
  toggleFavorite: (channelId: string) => void
  setFavorites: (ids: string[]) => void
  
  // Timezone
  timezone: string
  timezoneSource: 'auto' | 'manual'
  setTimezone: (tz: string, source?: 'auto' | 'manual') => void
  detectTimezone: () => void
}

const loadFavorites = (): string[] => {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem('zeng-favorites')
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

const saveFavorites = (ids: string[]) => {
  if (typeof window === 'undefined') return
  localStorage.setItem('zeng-favorites', JSON.stringify(ids))
}

const loadTimezone = (): { tz: string; source: 'auto' | 'manual' } => {
  if (typeof window === 'undefined') return { tz: 'UTC', source: 'auto' }
  try {
    const stored = localStorage.getItem('zeng-timezone')
    if (stored) {
      const parsed = JSON.parse(stored)
      return { tz: parsed.tz || 'UTC', source: parsed.source || 'auto' }
    }
  } catch {
    // ignore
  }
  // Auto-detect from browser
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    return { tz: detected || 'UTC', source: 'auto' }
  } catch {
    return { tz: 'UTC', source: 'auto' }
  }
}

const saveTimezone = (tz: string, source: 'auto' | 'manual') => {
  if (typeof window === 'undefined') return
  localStorage.setItem('zeng-timezone', JSON.stringify({ tz, source }))
}

export const useAppStore = create<AppState>((set, get) => ({
  // Navigation
  currentPage: 'home',
  navigationHistory: [],
  setCurrentPage: (page) => {
    const current = get().currentPage
    // Push current page to history only if we're actually navigating away
    if (current !== page) {
      set({
        currentPage: page,
        navigationHistory: [...get().navigationHistory, current]
      })
    }
    // Update URL hash for browser navigation
    if (typeof window !== 'undefined') {
      const hash = page === 'home' ? '#/' : `#/${page}`
      window.location.hash = hash
    }
  },
  goBack: () => {
    const { navigationHistory } = get()
    if (navigationHistory.length > 0) {
      const previousPage = navigationHistory[navigationHistory.length - 1]
      set({
        currentPage: previousPage,
        navigationHistory: navigationHistory.slice(0, -1)
      })
      if (typeof window !== 'undefined') {
        const hash = previousPage === 'home' ? '#/' : `#/${previousPage}`
        window.location.hash = hash
      }
    } else {
      // No history, go to home
      set({ currentPage: 'home' })
      if (typeof window !== 'undefined') {
        window.location.hash = '#/'
      }
    }
  },
  
  // Watch page
  currentChannelId: null,
  setCurrentChannelId: (id) => set({ currentChannelId: id }),
  
  // Admin
  adminPage: 'dashboard',
  setAdminPage: (page) => set({ adminPage: page }),
  isAdminAuth: false,
  setIsAdminAuth: (auth) => set({ isAdminAuth: auth }),
  
  // Sidebar
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  
  // Search
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  // Favorites
  favorites: loadFavorites(),
  toggleFavorite: (channelId) => {
    const current = get().favorites
    const updated = current.includes(channelId)
      ? current.filter(id => id !== channelId)
      : [...current, channelId]
    set({ favorites: updated })
    saveFavorites(updated)
  },
  setFavorites: (ids) => {
    set({ favorites: ids })
    saveFavorites(ids)
  },
  
  // Timezone
  timezone: loadTimezone().tz,
  timezoneSource: loadTimezone().source,
  setTimezone: (tz, source) => {
    const src = source || 'manual'
    set({ timezone: tz, timezoneSource: src })
    saveTimezone(tz, src)
  },
  detectTimezone: () => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
      set({ timezone: detected || 'UTC', timezoneSource: 'auto' })
      saveTimezone(detected || 'UTC', 'auto')
    } catch {
      set({ timezone: 'UTC', timezoneSource: 'auto' })
      saveTimezone('UTC', 'auto')
    }
  },
}))

// Initialize from URL hash on load + auto-unlock admin
if (typeof window !== 'undefined') {
  function initFromUrl() {
    const hash = window.location.hash.replace('#/', '').replace('#', '')
    const hashPage = hash.split('/')[0]

    // Auto-unlock admin if URL hash contains admin
    if (hashPage === 'admin') {
      useAppStore.setState({ isAdminAuth: true })
    }

    if (hash) {
      const validPages: PageName[] = ['home', 'live', 'watch', 'news', 'sports', 'cricket', 'football', 'entertainment', 'favorites', 'search', 'admin', 'more']
      const page = hashPage as PageName
      if (validPages.includes(page)) {
        useAppStore.setState({ currentPage: page })
      }
    }
  }

  initFromUrl()

  // Listen for hash changes (browser back/forward, manual URL entry)
  window.addEventListener('hashchange', initFromUrl)
}
