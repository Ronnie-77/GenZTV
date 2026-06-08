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

export const useAppStore = create<AppState>((set, get) => ({
  // Navigation
  currentPage: 'home',
  setCurrentPage: (page) => {
    set({ currentPage: page })
    // Update URL hash for browser navigation
    if (typeof window !== 'undefined') {
      const hash = page === 'home' ? '#/' : `#/${page}`
      window.location.hash = hash
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
}))

// Initialize from URL hash on load
if (typeof window !== 'undefined') {
  function initFromUrl() {
    const hash = window.location.hash.replace('#/', '').replace('#', '')
    const hashPage = hash.split('/')[0]

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
