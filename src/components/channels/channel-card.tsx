'use client'

import { useAppStore } from '@/lib/store'
import { type Channel } from '@/lib/api'
import { Heart, Tv, Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface ChannelCardProps {
  channel: Channel
  compact?: boolean
}

const categoryColors: Record<string, string> = {
  news: 'bg-purple-500/10 text-purple-600',
  sports: 'bg-blue-500/10 text-blue-600',
  cricket: 'bg-indigo-500/10 text-indigo-600',
  football: 'bg-amber-500/10 text-amber-600',
  entertainment: 'bg-pink-500/10 text-pink-600',
  international: 'bg-teal-500/10 text-teal-600',
}

export function ChannelCard({ channel, compact }: ChannelCardProps) {
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
        className="flex items-center gap-3 bg-card rounded-xl border border-border p-3 card-hover cursor-pointer group shadow-sm hover:shadow-md"
      >
        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0 overflow-hidden group-hover:border-primary/50 transition-colors">
          {channel.logo ? (
            <img src={channel.logo} alt={channel.name} className="w-full h-full object-cover" />
          ) : (
            <Tv className="h-4 w-4 text-foreground/50" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{channel.name}</p>
          <p className="text-xs text-muted-foreground capitalize">{channel.category}</p>
        </div>
        <button
          onClick={handleFavToggle}
          className="shrink-0 p-1 rounded-full hover:bg-secondary transition-colors"
        >
          <Heart
            className={`h-4 w-4 transition-all ${
              isFav ? 'text-red-500 fill-red-500 scale-110' : 'text-muted-foreground'
            }`}
          />
        </button>
      </div>
    )
  }

  return (
    <div
      onClick={handleClick}
      className="channel-card bg-card rounded-2xl border border-border p-4 flex flex-col items-center gap-3 cursor-pointer group relative"
    >
      {/* Favorite Button */}
      <button
        onClick={handleFavToggle}
        className="absolute top-2 right-2 p-1.5 rounded-full bg-background/50 hover:bg-background/80 transition-colors z-10"
      >
        <Heart
          className={`h-3.5 w-3.5 transition-all ${
            isFav ? 'text-red-500 fill-red-500 scale-110' : 'text-muted-foreground'
          }`}
        />
      </button>

      {/* Channel Logo */}
      <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center overflow-hidden">
        {channel.logo ? (
          <img src={channel.logo} alt={channel.name} className="w-full h-full object-cover" />
        ) : (
          <Tv className="h-6 w-6 text-foreground/50" />
        )}
      </div>

      {/* Channel Info */}
      <div className="text-center w-full">
        <p className="text-sm font-medium truncate">{channel.name}</p>
        <div className="flex items-center justify-center gap-1 mt-1">
          <Badge
            variant="secondary"
            className={`text-[10px] px-1.5 py-0 ${categoryColors[channel.category] || 'bg-secondary text-muted-foreground'}`}
          >
            {channel.category}
          </Badge>
        </div>
      </div>

      {/* View count */}
      {channel.viewCount > 0 && (
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
