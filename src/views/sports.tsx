'use client'

import { useChannels } from '@/lib/hooks'
import { ChannelCard } from '@/components/channels/channel-card'
import { Trophy } from 'lucide-react'

export function SportsPage() {
  // 'sports' category uses contains filter, so it matches "sports", "sports,cricket", "sports,football", etc.
  const { channels, loading: loadingChannels } = useChannels({ category: 'sports' })

  return (
    <div className="p-4 md:p-6 space-y-8">
      <div className="flex items-center gap-2">
        <Trophy className="h-6 w-6 text-zeng-gold" />
        <h1 className="text-2xl font-bold">Sports</h1>
      </div>

      {/* Sports Channels */}
      <section>
        <h2 className="text-lg font-bold mb-4">All Sports Channels</h2>
        <p className="text-xs text-muted-foreground mb-3">Includes channels from Sports, Cricket & Football categories</p>
        {loadingChannels ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl border border-border p-4 flex flex-col items-center gap-3 animate-pulse">
                <div className="w-14 h-14 bg-secondary rounded-xl" />
                <div className="h-3 bg-secondary rounded w-16" />
              </div>
            ))}
          </div>
        ) : channels.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-8 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-1">No sports channels found</h3>
            <p className="text-sm text-muted-foreground">Add sports channels in the admin panel.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {channels.map((channel) => (
              <ChannelCard key={channel.id} channel={channel} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
