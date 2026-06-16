'use client'

import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { fetchChannel, fetchMatch, type Channel, type Match } from '@/lib/api'
import { VideoPlayer } from '@/components/player/video-player'
import { ArrowLeft, Heart, Maximize, Minimize, RotateCw, List } from 'lucide-react'

export function TVWatch() {
  const {
    currentChannelId,
    setCurrentPage,
    goBack,
    toggleFavorite,
    favorites,
  } = useAppStore()

  const [channel, setChannel] = useState<Channel | null>(null)
  const [match, setMatch] = useState<Match | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeStreamIndex, setActiveStreamIndex] = useState(0)
  const [viewMode, setViewMode] = useState<'channel' | 'match'>('channel')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [hintVisible, setHintVisible] = useState(false)

  const playerWrapRef = useRef<HTMLDivElement>(null)
  const hintTimerRef = useRef<number | undefined>(undefined)

  // Fetch channel or match
  useEffect(() => {
    if (!currentChannelId) {
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const ch = await fetchChannel(currentChannelId!)
        if (cancelled) return
        setChannel(ch)
        setMatch(null)
        setViewMode('channel')
      } catch {
        try {
          const m = await fetchMatch(currentChannelId!)
          if (cancelled) return
          setMatch(m)
          setChannel(null)
          setViewMode('match')
        } catch {
          // not found
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [currentChannelId])

  const currentStreamUrl =
    viewMode === 'channel'
      ? channel?.streamUrl || ''
      : match?.streams?.[activeStreamIndex]?.url || ''
  const currentStreamType =
    viewMode === 'channel'
      ? channel?.streamType || 'iframe'
      : match?.streams?.[activeStreamIndex]?.type || 'iframe'
  const currentTitle =
    viewMode === 'channel' ? channel?.name || 'Unknown' : match?.title || 'Unknown'
  const isFav = channel ? favorites.includes(channel.id) : false

  // Show the remote hint for 4s whenever the channel changes
  useEffect(() => {
    if (!currentChannelId) return
    setHintVisible(true)
    if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current)
    hintTimerRef.current = window.setTimeout(() => setHintVisible(false), 4000)
    return () => {
      if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current)
    }
  }, [currentChannelId])

  // Remote control keymap for the watch page
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement && (document.activeElement.tagName || '').toLowerCase()) || ''
      // Don't hijack when typing in inputs
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        toggleFullscreen()
      } else if (e.key === 'Backspace' || e.key === 'Escape' || e.key === 'BrowserBack') {
        // Only handle Escape when not in fullscreen; backspace always goes back
        if (e.key === 'Escape' && isFullscreen) {
          // let the browser exit fullscreen naturally
          return
        }
        e.preventDefault()
        goBack()
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        reloadIframe()
      } else if (e.key === 'ArrowUp') {
        // Show hint on Up
        e.preventDefault()
        setHintVisible(true)
        if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current)
        hintTimerRef.current = window.setTimeout(() => setHintVisible(false), 4000)
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)

  }, [isFullscreen, goBack])

  // Track fullscreen changes (in case user exits via Esc)
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  function toggleFullscreen() {
    const el = playerWrapRef.current
    if (!el) return
    try {
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) el.requestFullscreen()
        else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen()
      } else {
        if (document.exitFullscreen) document.exitFullscreen()
        else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen()
      }
    } catch {
      // ignore
    }
  }

  function reloadIframe() {
    const iframe = playerWrapRef.current?.querySelector('iframe')
    if (iframe) {
      const src = iframe.src
      iframe.src = ''
      window.setTimeout(() => {
        iframe.src = src
      }, 100)
    }
  }

  if (!currentChannelId && !loading) {
    return (
      <div className="tv-empty" style={{ maxWidth: '32rem', margin: '2rem auto' }}>
        <div className="tv-empty-title">No channel selected</div>
        <p style={{ marginBottom: '1.5rem' }}>
          Pick a channel from the home screen to start watching.
        </p>
        <button
          className="tv-btn-primary tv-focusable"
          data-tv-focus
          onClick={() => setCurrentPage('home')}
        >
          Go Home
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="tv-watch">
        <div className="tv-watch-player">
          <div
            className="tv-skeleton"
            style={{ width: '100%', height: '100%', borderRadius: '1rem' }}
          />
        </div>
        <div className="tv-skeleton" style={{ width: '40%', height: '2rem' }} />
      </div>
    )
  }

  return (
    <div className="tv-watch">
      {/* Player */}
      <div className="tv-watch-player" ref={playerWrapRef}>
        {currentStreamUrl ? (
          <VideoPlayer
            key={currentStreamUrl}
            url={currentStreamUrl}
            type={currentStreamType}
            title={currentTitle}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 600,
            }}
          >
            No stream available
          </div>
        )}

        {/* Reload hint button (top-right) — focusable */}
        <button
          className="tv-focusable"
          data-tv-focus
          onClick={reloadIframe}
          aria-label="Reload stream"
          style={{
            position: 'absolute',
            top: '0.75rem',
            right: '0.75rem',
            zIndex: 20,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 0.875rem',
            borderRadius: '0.5rem',
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            fontSize: '0.8125rem',
            fontWeight: 600,
            border: '2px solid transparent',
          }}
        >
          <RotateCw className="h-3.5 w-3.5" />
          Reload
        </button>

        {/* On-screen remote hint */}
        {hintVisible && (
          <div className="tv-remote-hint" style={{ bottom: '1rem' }}>
            <span>
              <kbd>Back</kbd> Return
            </span>
            <span>
              <kbd>F</kbd> Fullscreen
            </span>
            <span>
              <kbd>R</kbd> Reload
            </span>
            <span>
              <kbd>↑</kbd> Show hint
            </span>
          </div>
        )}
      </div>

      {/* Title + actions */}
      <div className="tv-watch-info">
        <div>
          <h1 className="tv-watch-title">{currentTitle}</h1>
          <div className="tv-watch-meta">
            {viewMode === 'channel'
              ? [channel?.category, channel?.language, channel?.country]
                  .filter(Boolean)
                  .join(' · ')
              : [match?.league, match?.sport]
                  .filter(Boolean)
                  .join(' · ')}
          </div>
        </div>

        <div className="tv-watch-actions">
          <button
            className="tv-watch-action tv-focusable"
            data-tv-focus
            onClick={goBack}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          {channel && (
            <button
              className={`tv-watch-action tv-focusable ${isFav ? 'is-fav' : ''}`}
              data-tv-focus
              onClick={() => toggleFavorite(channel.id)}
            >
              <Heart className="h-4 w-4" fill={isFav ? 'currentColor' : 'none'} />
              {isFav ? 'Favorited' : 'Add to Favorites'}
            </button>
          )}

          <button
            className="tv-watch-action tv-focusable"
            data-tv-focus
            onClick={toggleFullscreen}
          >
            {isFullscreen ? (
              <>
                <Minimize className="h-4 w-4" /> Exit Fullscreen
              </>
            ) : (
              <>
                <Maximize className="h-4 w-4" /> Fullscreen
              </>
            )}
          </button>

          <button
            className="tv-watch-action tv-focusable"
            data-tv-focus
            onClick={reloadIframe}
          >
            <RotateCw className="h-4 w-4" />
            Reload
          </button>
        </div>
      </div>

      {/* Stream selector for matches */}
      {viewMode === 'match' && match && match.streams && match.streams.length > 0 && (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.75rem',
              fontWeight: 700,
              fontSize: '1rem',
            }}
          >
            <List className="h-4 w-4" />
            Streams
          </div>
          <div className="tv-watch-streams">
            {match.streams.map((s, i) => (
              <button
                key={s.id || i}
                className="tv-watch-stream-btn tv-focusable"
                data-tv-focus
                data-active={i === activeStreamIndex ? 'true' : 'false'}
                onClick={() => setActiveStreamIndex(i)}
              >
                {s.name || `Stream ${i + 1}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Related channels (quick switch) */}
      {viewMode === 'channel' && <RelatedChannels currentId={channel?.id} />}
    </div>
  )
}

/** Quick-switch list of other channels — focusable. */
function RelatedChannels({ currentId }: { currentId?: string }) {
  const { setCurrentChannelId } = useAppStore()
  const [channels, setChannels] = useState<Channel[]>([])

  useEffect(() => {
    let cancelled = false
    import('@/lib/api').then(({ fetchChannels }) => {
      fetchChannels().then((all) => {
        if (!cancelled) setChannels(all.filter((c) => c.id !== currentId).slice(0, 10))
      }).catch(() => {})
    })
    return () => {
      cancelled = true
    }
  }, [currentId])

  if (channels.length === 0) return null

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          margin: '1.5rem 0 0.75rem',
          fontWeight: 700,
          fontSize: '1.125rem',
        }}
      >
        More Channels
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))',
          gap: '0.75rem',
        }}
      >
        {channels.map((c) => (
          <button
            key={c.id}
            className="tv-watch-stream-btn tv-focusable"
            data-tv-focus
            onClick={() => setCurrentChannelId(c.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
              padding: '0.75rem 1rem',
              textAlign: 'left',
            }}
          >
            {c.logo ? (

              <img
                src={c.logo}
                alt=""
                style={{ width: '1.75rem', height: '1.75rem', objectFit: 'contain', borderRadius: '0.375rem' }}
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : null}
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {c.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
