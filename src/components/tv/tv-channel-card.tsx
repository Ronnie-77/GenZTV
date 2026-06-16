'use client'

import { type Channel } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { Heart, Tv as TvIcon } from 'lucide-react'
import { toast } from 'sonner'

const categoryIcons: Record<string, string> = {
  news: '📰',
  sports: '🏆',
  cricket: '🏏',
  football: '⚽',
  entertainment: '🎬',
  international: '🌍',
}

interface TVChannelCardProps {
  channel: Channel
}

export function TVChannelCard({ channel }: TVChannelCardProps) {
  const { setCurrentPage, setCurrentChannelId, toggleFavorite, favorites } = useAppStore()
  const isFav = favorites.includes(channel.id)

  const handleOpen = () => {
    setCurrentChannelId(channel.id)
    setCurrentPage('watch')
  }

  const handleFavToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleFavorite(channel.id)
    const isFavNow = favorites.includes(channel.id)
    toast(isFavNow ? 'Removed from favorites' : 'Added to favorites', {
      description: channel.name,
      duration: 2000,
    })
  }

  const primaryCat = (channel.category || '').split(',')[0].trim()

  return (
    <div
      className="tv-channel-card tv-focusable"
      data-tv-focus
      onClick={handleOpen}
      role="button"
      tabIndex={0}
      aria-label={`Watch ${channel.name}`}
    >
      {channel.isFeatured && (
        <span className="tv-channel-live">LIVE</span>
      )}
      <button
        className="tv-channel-fav tv-focusable"
        data-tv-focus
        onClick={handleFavToggle}
        aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
        style={{ background: isFav ? '#ef4444' : undefined }}
      >
        <Heart
          className="h-4 w-4"
          style={{ color: isFav ? '#fff' : undefined }}
          fill={isFav ? '#fff' : 'none'}
        />
      </button>

      <div className="tv-channel-logo">
        {channel.logo ? (
          <img
            src={channel.logo}
            alt={channel.name}
            loading="lazy"
            decoding="async"
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <TvIcon className="h-8 w-8 text-foreground/40" />
        )}
      </div>

      <p className="tv-channel-name">{channel.name}</p>
      {primaryCat && (
        <span className="tv-channel-cat">
          {categoryIcons[primaryCat] ? categoryIcons[primaryCat] + ' ' : ''}
          {primaryCat}
        </span>
      )}
    </div>
  )
}
