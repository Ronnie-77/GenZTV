'use client'

import { useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { useChannels } from '@/lib/hooks'
import { TVChannelCard } from '@/components/tv/tv-channel-card'
import { Tv } from 'lucide-react'

interface TVChannelsProps {
  mode: 'all' | 'category' | 'favorites'
  category?: string
  title: string
}

export function TVChannels({ mode, category, title }: TVChannelsProps) {
  const { favorites } = useAppStore()
  const { channels, loading } = useChannels(mode === 'category' ? { category } : {})

  const visible = useMemo(() => {
    if (mode === 'favorites') {
      return channels.filter((c) => favorites.includes(c.id))
    }
    return channels
  }, [channels, mode, favorites])

  return (
    <div>
      <div className="tv-section-header" style={{ marginBottom: '1.25rem' }}>
        <div className="tv-section-title">
          <Tv className="h-6 w-6" style={{ color: 'var(--primary)' }} />
          {title}
          {!loading && visible.length > 0 && (
            <span className="tv-section-count">{visible.length}</span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="tv-grid-channels">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="tv-channel-card" style={{ opacity: 0.6 }}>
              <div
                className="tv-skeleton"
                style={{ width: '5.5rem', height: '5.5rem', borderRadius: '0.875rem' }}
              />
              <div className="tv-skeleton" style={{ width: '60%', height: '1rem' }} />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="tv-empty">
          <Tv className="h-10 w-10" style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
          <div className="tv-empty-title">
            {mode === 'favorites' ? 'No favorites yet' : 'No channels available'}
          </div>
          <div>
            {mode === 'favorites'
              ? 'Add channels to your favorites by pressing the heart icon.'
              : 'Channels will appear here when added.'}
          </div>
        </div>
      ) : (
        <div className="tv-grid-channels">
          {visible.map((c) => (
            <TVChannelCard key={c.id} channel={c} />
          ))}
        </div>
      )}
    </div>
  )
}
