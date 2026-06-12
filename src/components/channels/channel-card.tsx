'use client'

import { useAppStore } from '@/lib/store'
import { type Channel } from '@/lib/api'
import { Heart, Tv, Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface ChannelCardProps {
  channel: Channel
  compact?: boolean
  home?: boolean  // Home page variant: no category badge, no view count
}

const categoryIcons: Record<string, string> = {
  news: '📰',
  sports: '🏆',
  cricket: '🏏',
  football: '⚽',
  entertainment: '🎬',
  international: '🌍',
}

/** Parse comma-separated category string into array */
function parseCategories(categoryStr: string): string[] {
  if (!categoryStr) return []
  return categoryStr.split(',').map(c => c.trim()).filter(Boolean)
}

export function ChannelCard({ channel, compact, home }: ChannelCardProps) {
  const { setCurrentPage, setCurrentChannelId, toggleFavorite, favorites } = useAppStore()
  const isFav = favorites.includes(channel.id)

  const handleClick = () => {
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

  if (compact) {
    return (
      <div
        onClick={handleClick}
        className="channel-card flex items-center gap-3 bg-card border border-border p-3 cursor-pointer group rounded-xl shadow-sm"
      >
        <div className="w-10 h-10 bg-secondary flex items-center justify-center shrink-0 overflow-hidden rounded-lg">
          {channel.logo ? (
            <img src={channel.logo} alt={channel.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <Tv className="h-4 w-4 text-foreground/50" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{channel.name}</p>
          <div className="flex items-center gap-1 flex-wrap">
            {parseCategories(channel.category).map((cat, i) => (
              <span key={i} className="text-[10px] text-muted-foreground">
                {i > 0 && <span className="mr-1">·</span>}
                {categoryIcons[cat] && <span className="mr-0.5">{categoryIcons[cat]}</span>}
                {cat}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={handleFavToggle}
          className="shrink-0 p-1 rounded-full hover:bg-secondary"
        >
          <Heart
            className={`h-4 w-4 ${
              isFav ? 'text-red-500 fill-red-500' : 'text-muted-foreground'
            }`}
          />
        </button>
      </div>
    )
  }

  return (
    <div
      onClick={handleClick}
      className="channel-card bg-card border border-border p-4 flex flex-col items-center gap-3 cursor-pointer group relative rounded-2xl shadow-sm"
    >
      {/* Favorite Button */}
      <button
        onClick={handleFavToggle}
        className="absolute top-2 right-2 p-1.5 rounded-full bg-background/50 hover:bg-background/80 z-10"
      >
        <Heart
          className={`h-3.5 w-3.5 ${
            isFav ? 'text-red-500 fill-red-500' : 'text-muted-foreground'
          }`}
        />
      </button>

      {/* Channel Logo */}
      <div className="w-14 h-14 bg-secondary flex items-center justify-center overflow-hidden rounded-xl">
        {channel.logo ? (
          <img src={channel.logo} alt={channel.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <Tv className="h-6 w-6 text-foreground/50" />
        )}
      </div>

      {/* Channel Info */}
      <div className="text-center w-full">
        <p className="text-sm font-medium truncate">{channel.name}</p>
        {!home && (
          <div className="flex items-center justify-center gap-1 flex-wrap">
            {parseCategories(channel.category).map((cat, i) => (
              <Badge
                key={i}
                variant="secondary"
                className={`text-[10px] px-1.5 py-0 capitalize ${i === 0 ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}
              >
                {categoryIcons[cat] && <span className="mr-0.5">{categoryIcons[cat]}</span>}
                {cat}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* View count */}
      {!home && channel.viewCount > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Eye className="h-3 w-3" />
          <span>{channel.viewCount.toLocaleString()}</span>
        </div>
      )}

      {/* Featured indicator */}
      {channel.isFeatured && (
        <div className="absolute top-2 left-2">
          <span className="text-[9px] bg-amber-500/15 text-amber-600 px-1.5 py-0.5 rounded-full font-bold">
            ★
          </span>
        </div>
      )}
    </div>
  )
}
