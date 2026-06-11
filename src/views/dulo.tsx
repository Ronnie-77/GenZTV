'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { fetchChannels, type Channel } from '@/lib/api'
import { ChannelCard } from '@/components/channels/channel-card'
import { Radio, RefreshCw, Tv, Film, Newspaper, Trophy, Baby, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'

const duloCategories = [
  { key: 'all', label: 'All', icon: Radio },
  { key: 'sports', label: 'Sports', icon: Trophy },
  { key: 'entertainment', label: 'Entertainment', icon: Tv },
  { key: 'news', label: 'News', icon: Newspaper },
  { key: 'movies', label: 'Movies', icon: Film },
  { key: 'documentary', label: 'Docs', icon: Globe },
  { key: 'kids', label: 'Kids', icon: Baby },
]

export function DuloPage() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState('all')

  const loadChannels = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchChannels({
        source: 'dulo',
        ...(activeCategory !== 'all' ? { category: activeCategory } : {}),
      })
      setChannels(data)
    } catch {
      setChannels([])
    } finally {
      setLoading(false)
    }
  }, [activeCategory])

  useEffect(() => {
    loadChannels()
  }, [loadChannels])

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Tv className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Dulo TV</h1>
            <p className="text-sm text-muted-foreground">Premium Live Channels</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadChannels}
          className="gap-1.5 btn-press"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto scroll-row pb-2">
        {duloCategories.map((cat) => {
          const Icon = cat.icon
          const isActive = activeCategory === cat.key
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all btn-press ${
                isActive
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {cat.label}
            </button>
          )
        })}
      </div>

      {/* Channel count */}
      {!loading && channels.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {channels.length} channel{channels.length !== 1 ? 's' : ''} available
        </p>
      )}

      {/* Channel Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="bg-card rounded-2xl border border-border p-4 flex flex-col items-center gap-3 animate-pulse">
              <div className="w-14 h-14 bg-secondary rounded-xl" />
              <div className="h-3 bg-secondary rounded w-16" />
            </div>
          ))}
        </div>
      ) : channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mb-4">
            <Tv className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No channels found</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {activeCategory !== 'all'
              ? 'Try a different category or check back later.'
              : 'Dulo TV channels will appear here once synced from admin.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {channels.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} />
          ))}
        </div>
      )}
    </div>
  )
}
