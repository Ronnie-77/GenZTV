'use client'

import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { fetchChannel, fetchMatch, type Channel, type Match } from '@/lib/api'
import { VideoPlayer } from '@/components/player/video-player'
import { ChannelCard } from '@/components/channels/channel-card'
import { useChannels } from '@/lib/hooks'
import { ArrowLeft, Heart, Share2, Tv, ExternalLink, Radio, ListVideo } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchSettings } from '@/lib/api'

// Dynamic ad slot — renders custom ad script HTML from settings
function DynamicAdSlot({ script }: { script: string }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !script.trim()) return
    containerRef.current.innerHTML = ''
    const wrapper = document.createElement('div')
    wrapper.innerHTML = script.trim()
    while (wrapper.firstChild) {
      const node = wrapper.firstChild
      if (node.nodeName === 'SCRIPT') {
        const newScript = document.createElement('script')
        const oldScript = node as HTMLScriptElement
        if (oldScript.src) newScript.src = oldScript.src
        if (oldScript.textContent) newScript.textContent = oldScript.textContent
        Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value))
        newScript.async = true
        containerRef.current.appendChild(newScript)
      } else {
        containerRef.current.appendChild(node)
      }
    }
  }, [script])

  if (!script.trim()) return null
  return <div ref={containerRef} className="w-full max-w-[728px]" />
}

// Adsterra Banner Ad — dynamically injects ad script below video player (mobile & PC)
function BannerAd() {
  const containerRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current || !containerRef.current) return
    initialized.current = true

    const container = containerRef.current

    // Inject atOptions config script
    const configScript = document.createElement('script')
    configScript.textContent = `
      atOptions = {
        'key' : '297e220ba939d2e247ad7b9372939809',
        'format' : 'iframe',
        'height' : 90,
        'width' : 728,
        'params' : {}
      };
    `
    container.appendChild(configScript)

    // Inject invoke.js script
    const invokeScript = document.createElement('script')
    invokeScript.src = 'https://www.highperformanceformat.com/297e220ba939d2e247ad7b9372939809/invoke.js'
    invokeScript.async = true
    container.appendChild(invokeScript)
  }, [])

  return (
    <div className="w-full flex justify-center mt-4">
      <div ref={containerRef} className="w-full max-w-[728px] min-h-[90px] overflow-hidden" />
    </div>
  )
}

export function WatchPage() {
  const { currentChannelId, setCurrentPage, goBack, toggleFavorite, favorites } = useAppStore()
  const [channel, setChannel] = useState<Channel | null>(null)
  const [match, setMatch] = useState<Match | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeStreamIndex, setActiveStreamIndex] = useState(0)
  const [viewMode, setViewMode] = useState<'channel' | 'match'>('channel')
  const [videoAdsEnabled, setVideoAdsEnabled] = useState(true)
  const [videoAdScripts, setVideoAdScripts] = useState<{id: string; name: string; script: string; position: string; enabled: boolean}[]>([])

  // Fetch ad settings
  useEffect(() => {
    fetchSettings().then(s => {
      setVideoAdsEnabled(s.adsEnabled && (s.videoAdsEnabled ?? true))
      try {
        const all = JSON.parse(s.customAdScripts || '[]')
        const videoAds = all.filter((a: {position: string; enabled: boolean}) => a.position === 'video-below' && a.enabled)
        setVideoAdScripts(videoAds)
      } catch { /* ignore */ }
    }).catch(() => {})
  }, [])

  // Fetch related channels from the same category
  const { channels: relatedChannels, loading: loadingRelated } = useChannels(
    channel ? { category: channel.category } : undefined
  )

  // Fetch channel or match data
  useEffect(() => {
    if (!currentChannelId) {
      setLoading(false)
      return
    }

    async function loadData() {
      setLoading(true)
      try {
        const ch = await fetchChannel(currentChannelId)
        setChannel(ch)
        setViewMode('channel')
      } catch {
        try {
          const m = await fetchMatch(currentChannelId)
          setMatch(m)
          setViewMode('match')
        } catch {
          // Not found
        }
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [currentChannelId])

  // Determine current stream info
  const currentStreamUrl = viewMode === 'channel'
    ? channel?.streamUrl || ''
    : match?.streams?.[activeStreamIndex]?.url || ''

  const currentStreamType = viewMode === 'channel'
    ? channel?.streamType || 'iframe'
    : match?.streams?.[activeStreamIndex]?.type || 'iframe'

  const currentTitle = viewMode === 'channel'
    ? channel?.name || 'Unknown Channel'
    : match?.title || 'Unknown Match'

  const isFav = channel ? favorites.includes(channel.id) : false

  // Filter out current channel from related, show all
  const filteredRelated = relatedChannels.filter(ch => ch.id !== channel?.id)

  // For matches, also prepare related channels from the sport's category
  const matchCategory = match?.sport === 'cricket' ? 'cricket'
    : match?.sport === 'football' ? 'football'
    : 'sports'
  const { channels: matchRelatedChannels } = useChannels(
    viewMode === 'match' ? { category: matchCategory } : undefined
  )
  const filteredMatchRelated = matchRelatedChannels.filter(ch => ch.id !== channel?.id)

  // No channel selected state
  if (!currentChannelId && !loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
        <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mb-4">
          <Tv className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold mb-2">Select a channel to watch</h2>
        <p className="text-sm text-muted-foreground max-w-md mb-4">
          Browse channels or matches and click on any to start watching.
        </p>
        <Button onClick={() => setCurrentPage('live')} className="btn-press gap-2">
          <Radio className="h-4 w-4" />
          Browse Channels
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {/* Channel/Match Info Section */}
      <div className="p-4 md:p-6 pb-2 md:pb-3">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goBack()}
            className="shrink-0 mt-0.5"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            {loading ? (
              <>
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-32" />
              </>
            ) : viewMode === 'channel' && channel ? (
              <>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold">{channel.name}</h2>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleFavorite(channel.id)}
                      className={`h-8 w-8 rounded-full hover:bg-secondary ${isFav ? 'text-red-500' : 'text-muted-foreground'}`}
                    >
                      <Heart className={`h-4 w-4 ${isFav ? 'fill-red-500' : ''}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full hover:bg-secondary text-muted-foreground"
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="secondary" className="capitalize">
                    {channel.category}
                  </Badge>
                  {channel.language && (
                    <span className="text-xs text-muted-foreground">{channel.language}</span>
                  )}
                  {channel.country && (
                    <span className="text-xs text-muted-foreground">• {channel.country}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    • {channel.streamType.toUpperCase()}
                  </span>
                </div>
              </>
            ) : viewMode === 'match' && match ? (
              <>
                <h2 className="text-xl font-bold">{match.title}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {match.status === 'live' ? (
                    <Badge className="bg-red-500 text-white animate-live-pulse">● LIVE</Badge>
                  ) : match.status === 'upcoming' ? (
                    <Badge className="bg-yellow-500/20 text-yellow-400">Upcoming</Badge>
                  ) : (
                    <Badge variant="secondary">Ended</Badge>
                  )}
                  <Badge variant="secondary" className="capitalize">
                    {match.sport}
                  </Badge>
                  {match.league && (
                    <span className="text-xs text-muted-foreground">{match.league}</span>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Video Player + Banner Ad + Related Channels */}
      <div className="px-4 md:px-6">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left: Ad + Video Player + Stream Selector */}
          <div className="flex-1 min-w-0 max-w-4xl relative z-10">
            {/* Banner Ad above player — PC only, mobile shows below */}
            {videoAdsEnabled && (
              <div className="hidden lg:flex flex-col items-center gap-3 mb-4">
                {videoAdScripts.map((ad) => (
                  <DynamicAdSlot key={ad.id} script={ad.script} />
                ))}
                {videoAdScripts.length === 0 && <BannerAd />}
              </div>
            )}

            <div className="relative w-full bg-black rounded-xl overflow-hidden z-10">
              {loading ? (
                <div className="w-full aspect-video flex items-center justify-center bg-black">
                  <p className="text-white/40 text-sm">Loading stream...</p>
                </div>
              ) : (
                <VideoPlayer
                  streamUrl={currentStreamUrl}
                  streamType={currentStreamType}
                  title={currentTitle}
                  isLive={viewMode === 'match' ? match?.status === 'live' : true}
                />
              )}
            </div>

            {/* Stream selector for matches — below video */}
            {viewMode === 'match' && match && match.streams.length > 1 && (
              <div className="mt-3">
                <div className="flex gap-1.5 flex-wrap">
                  {match.streams.map((stream, index) => (
                    <button
                      key={stream.id}
                      onClick={() => setActiveStreamIndex(index)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors btn-press ${
                        index === activeStreamIndex
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                      }`}
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      {stream.name || `Stream ${index + 1}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Banner Ad below player — mobile only */}
            {videoAdsEnabled && (
              <div className="flex lg:hidden flex-col items-center gap-3 mt-4">
                {videoAdScripts.map((ad) => (
                  <DynamicAdSlot key={ad.id} script={ad.script} />
                ))}
                {videoAdScripts.length === 0 && <BannerAd />}
              </div>
            )}
          </div>

          {/* Right: Related Channels */}
          <div className="w-full lg:w-72 xl:w-80 shrink-0 space-y-4">
            {/* Related Channels — for both channel and match views */}
            {((viewMode === 'channel' && channel) || (viewMode === 'match' && match)) && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ListVideo className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Related Channels</h3>
                  {!loadingRelated && (viewMode === 'channel' ? filteredRelated.length : filteredMatchRelated.length) > 0 && (
                    <span className="text-xs text-muted-foreground">({viewMode === 'channel' ? filteredRelated.length : filteredMatchRelated.length})</span>
                  )}
                </div>
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin">
                  {loadingRelated ? (
                    <>
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="flex items-center gap-3 bg-card rounded-xl border border-border p-3 animate-pulse">
                          <div className="w-10 h-10 bg-secondary rounded-lg" />
                          <div className="flex-1">
                            <div className="h-3 bg-secondary rounded w-20 mb-1" />
                            <div className="h-2 bg-secondary rounded w-14" />
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (viewMode === 'channel' ? filteredRelated : filteredMatchRelated).length > 0 ? (
                    (viewMode === 'channel' ? filteredRelated : filteredMatchRelated).map(ch => (
                      <ChannelCard key={ch.id} channel={ch} compact />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No related channels</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
