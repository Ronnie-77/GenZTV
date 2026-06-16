'use client'

import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { fetchChannel, fetchMatch, fetchChannels, type Channel, type Match } from '@/lib/api'
import { VideoPlayer } from '@/components/player/video-player'
import { ArrowLeft, Heart, Share2, Tv, ExternalLink, Radio, List } from 'lucide-react'
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
    <div className="w-full flex justify-center">
      <div ref={containerRef} className="w-full min-h-[90px]" />
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
  const [videoAboveMobileAds, setVideoAboveMobileAds] = useState<{id: string; name: string; script: string; position: string; enabled: boolean}[]>([])
  const [videoAbovePcAds, setVideoAbovePcAds] = useState<{id: string; name: string; script: string; position: string; enabled: boolean}[]>([])
  const [nativeBannerAds, setNativeBannerAds] = useState<{id: string; name: string; script: string; position: string; enabled: boolean}[]>([])
  const [allChannels, setAllChannels] = useState<Channel[]>([])

  // Fetch ad settings
  useEffect(() => {
    fetchSettings().then(s => {
      setVideoAdsEnabled(s.adsEnabled && (s.videoAdsEnabled ?? true))
      try {
        const all = JSON.parse(s.customAdScripts || '[]')
        const enabled = (a: {enabled: boolean}) => a.enabled
        setVideoAboveMobileAds(all.filter((a: {position: string; enabled: boolean}) => a.position === 'video-above-mobile' && enabled(a)))
        setVideoAbovePcAds(all.filter((a: {position: string; enabled: boolean}) => a.position === 'video-above-pc' && enabled(a)))
        setNativeBannerAds(all.filter((a: {position: string; enabled: boolean}) => a.position === 'native-banner' && enabled(a)))
      } catch { /* ignore */ }
    }).catch(() => {})
  }, [])

  // Fetch all channels for sidebar list
  useEffect(() => {
    fetchChannels().then(setAllChannels).catch(() => {})
  }, [])

  // Fetch channel or match data
  useEffect(() => {
    if (!currentChannelId) {
      setLoading(false)
      return
    }

    async function loadData() {
      setLoading(true)
      try {
        const ch = await fetchChannel(currentChannelId!)
        setChannel(ch)
        setViewMode('channel')
      } catch {
        try {
          const m = await fetchMatch(currentChannelId!)
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

      {/* Banner Ad — above video player (outside flex row) */}
      {videoAdsEnabled && (
        <div className="px-4 md:px-6 mb-4">
          {/* 📱 Mobile */}
          <div className="flex lg:hidden flex-col items-center gap-3">
            {videoAboveMobileAds.map((ad) => (
              <DynamicAdSlot key={ad.id} script={ad.script} />
            ))}
            {videoAboveMobileAds.length === 0 && <BannerAd />}
          </div>
          {/* 🖥️ PC */}
          <div className="hidden lg:flex flex-col items-center gap-3">
            {videoAbovePcAds.map((ad) => (
              <DynamicAdSlot key={ad.id} script={ad.script} />
            ))}
            {videoAbovePcAds.length === 0 && <BannerAd />}
          </div>
        </div>
      )}

      {/* Video Player + Channel List */}
      <div className="px-4 md:px-6">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left: Video Player + Stream Selector */}
          <div className="flex-1 min-w-0 max-w-4xl relative">
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
          </div>

          {/* Right: Channel List — PC only, top-aligned with video player */}
          <div className="hidden lg:flex lg:flex-col w-72 xl:w-80 shrink-0">
            <div className="rounded-xl border bg-card overflow-hidden">
              {/* Channel list header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
                <List className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Channels</span>
                <span className="ml-auto text-xs text-muted-foreground">{allChannels.length}</span>
              </div>
              {/* Channel list */}
              <div className="overflow-y-auto max-h-[calc(340px+6rem)] channel-list-scroll" style={{ scrollbarGutter: 'stable' }}>
                {allChannels.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">No channels</div>
                ) : (
                  allChannels.map((ch) => {
                    const isActive = currentChannelId === ch.id
                    return (
                      <button
                        key={ch.id}
                        onClick={() => {
                          useAppStore.getState().setCurrentChannelId(ch.id)
                          useAppStore.getState().setCurrentPage('watch')
                        }}
                        className={`channel-list-item w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-200 hover:bg-muted/50 ${
                          isActive ? 'channel-list-item-active' : ''
                        }`}
                      >
                        {ch.logo ? (
                          <img
                            src={ch.logo}
                            alt={ch.name}
                            className={`w-10 h-10 rounded-lg object-cover bg-muted shrink-0 transition-all duration-300 ${isActive ? 'ring-2 ring-primary shadow-md shadow-primary/20' : ''}`}
                            loading="lazy"
                          />
                        ) : (
                          <div className={`w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 transition-all duration-300 ${isActive ? 'ring-2 ring-primary shadow-md shadow-primary/20' : ''}`}>
                            <Tv className={`h-5 w-5 transition-colors duration-300 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm truncate transition-all duration-300 ${isActive ? 'font-bold text-primary' : 'font-medium'}`}>
                            {ch.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground capitalize truncate">
                            {ch.category}{ch.country ? ` · ${ch.country}` : ''}
                          </p>
                        </div>
                        {isActive && (
                          <div className="shrink-0 flex items-center gap-1">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                          </div>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 📋 Native Banner Ad — Bottom of Watch Page */}
      {videoAdsEnabled && nativeBannerAds.length > 0 && (
        <div className="px-4 md:px-6 mt-6 mb-4 flex flex-col items-center gap-3">
          {nativeBannerAds.map((ad) => (
            <DynamicAdSlot key={ad.id} script={ad.script} />
          ))}
        </div>
      )}
    </div>
  )
}
