'use client'

import { useMemo, useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { useChannels, useMatches } from '@/lib/hooks'
import { TVChannelCard } from '@/components/tv/tv-channel-card'
import { useTVAds, TVAdSection } from '@/components/tv/tv-ads'
import { Play, ChevronRight, Antenna, Trophy, Globe, Zap, Tv } from 'lucide-react'
import { type Match } from '@/lib/api'

export function TVHome() {
  const { setCurrentPage } = useAppStore()
  const tvAds = useTVAds()
  const homeBannerAds = tvAds.adsByPositions('tv-home-banner')
  // Universal `social-bar` position takes PRECEDENCE over the TV-specific
  // `tv-home-social` position — this way an admin who configures the universal
  // social bar sees it on ALL platforms (mobile/PC/TV) without a duplicate
  // appearing on TV from the TV-only slot. Falls back to tv-home-social only
  // when no universal social-bar scripts are configured.
  const universalSocialAds = tvAds.adsByPositions('social-bar')
  const homeSocialAds = universalSocialAds.length > 0
    ? universalSocialAds
    : tvAds.adsByPositions('tv-home-social')
  const homeAdsOn = tvAds.adsEnabled && tvAds.homeAdsEnabled

  const { matches: liveMatches, loading: loadingLive } = useMatches({ status: 'live' })
  const { matches: upcomingMatches, loading: loadingUpcoming } = useMatches({ status: 'upcoming' })
  const { channels, loading: loadingChannels } = useChannels({})
  const { channels: featuredChannels, loading: loadingFeatured } = useChannels({ featured: true })

  // Tick every 30s so matches that have started move to Live section
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(id)
  }, [])

  const { startedUpcoming, stillUpcoming } = useMemo(() => {
    const started: Match[] = []
    const upcoming: Match[] = []
    for (const m of upcomingMatches) {
      if (new Date(m.startTime).getTime() <= now) started.push(m)
      else upcoming.push(m)
    }
    return { startedUpcoming: started, stillUpcoming: upcoming }
  }, [upcomingMatches, now])

  const allLiveMatches = useMemo(() => {
    const combined = [...liveMatches, ...startedUpcoming]
    return combined.filter((m) => {
      if (m.endTime && new Date(m.endTime).getTime() <= now) return false
      return true
    })
  }, [liveMatches, startedUpcoming, now])

  // Hero: pick the first live match, else first featured channel, else first channel
  const heroMatch = allLiveMatches[0]
  const heroChannel = featuredChannels[0] || channels[0]

  const openHero = () => {
    if (heroMatch) {
      useAppStore.getState().setCurrentChannelId(heroMatch.id)
      setCurrentPage('watch')
    } else if (heroChannel) {
      useAppStore.getState().setCurrentChannelId(heroChannel.id)
      setCurrentPage('watch')
    } else {
      setCurrentPage('live')
    }
  }

  return (
    <div>
      {/* Banner Ad — top of TV home */}
      <TVAdSection
        ads={homeBannerAds}
        legacyScript={tvAds.bannerAdScript}
        variant="banner"
        label="Advertisement"
      />

      {/* Hero */}
      <section className="tv-hero">
        <div className="tv-hero-content">
          {heroMatch ? (
            <>
              <span className="tv-hero-eyebrow">
                <span
                  style={{
                    width: '0.5rem',
                    height: '0.5rem',
                    borderRadius: '9999px',
                    background: '#ef4444',
                    display: 'inline-block',
                  }}
                />
                Live Now
              </span>
              <h1 className="tv-hero-title">{heroMatch.title}</h1>
              <p className="tv-hero-subtitle">
                {heroMatch.league ? heroMatch.league + ' · ' : ''}
                {heroMatch.teamA} vs {heroMatch.teamB}
              </p>
            </>
          ) : (
            <>
              <span className="tv-hero-eyebrow">
                <Antenna className="h-3.5 w-3.5" />
                Premium Streaming
              </span>
              <h1 className="tv-hero-title">GenZ TV</h1>
              <p className="tv-hero-subtitle">
                Your premium destination for live TV, sports, cricket, football &amp;
                entertainment. Watch your favorite channels anytime, anywhere.
              </p>
            </>
          )}
          <div className="tv-hero-actions">
            <button
              className="tv-btn-primary tv-focusable"
              data-tv-focus
              onClick={openHero}
            >
              <Play className="h-5 w-5" fill="currentColor" />
              Watch Now
            </button>
            <button
              className="tv-btn-secondary tv-focusable"
              data-tv-focus
              onClick={() => setCurrentPage('live')}
            >
              Browse Channels
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Stats */}
          <div
            style={{
              display: 'flex',
              gap: '1.5rem',
              marginTop: '1.5rem',
              color: 'var(--muted-foreground)',
              fontSize: '0.9375rem',
              fontWeight: 600,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Antenna className="h-4 w-4" />
              {channels.length || '50+'} Channels
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Trophy className="h-4 w-4" />
              Live Sports
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Globe className="h-4 w-4" />
              HD Quality
            </span>
          </div>
        </div>
      </section>

      {/* Social Bar Ad — below hero, above content sections */}
      <TVAdSection
        ads={homeSocialAds}
        legacyScript={tvAds.socialBarAdScript}
        variant="social"
        label="Advertisement"
      />

      {/* Live matches */}
      <section className="tv-section">
        <div className="tv-section-header">
          <div className="tv-section-title">
            <span
              style={{
                width: '0.625rem',
                height: '0.625rem',
                borderRadius: '9999px',
                background: '#ef4444',
                display: 'inline-block',
              }}
            />
            Live Now
            {!loadingLive && allLiveMatches.length > 0 && (
              <span className="tv-section-count">{allLiveMatches.length}</span>
            )}
          </div>
          <button
            className="tv-section-link tv-focusable"
            data-tv-focus
            onClick={() => setCurrentPage('sports')}
          >
            View All <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {loadingLive ? (
          <TVMatchSkeleton />
        ) : allLiveMatches.length === 0 ? (
          <div className="tv-empty">
            <Tv className="h-10 w-10" style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
            <div className="tv-empty-title">No live matches right now</div>
            <div>Check back later for live action!</div>
          </div>
        ) : (
          <div className="tv-grid-matches">
            {allLiveMatches.slice(0, 6).map((m) => (
              <TVMatchCard key={m.id} match={m} />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming */}
      {stillUpcoming.length > 0 && (
        <section className="tv-section">
          <div className="tv-section-header">
            <div className="tv-section-title">
              <Zap className="h-5 w-5" style={{ color: '#f59e0b' }} />
              Coming Up
              <span className="tv-section-count">{stillUpcoming.length}</span>
            </div>
            <button
              className="tv-section-link tv-focusable"
              data-tv-focus
              onClick={() => setCurrentPage('sports')}
            >
              View All <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="tv-grid-matches">
            {stillUpcoming.slice(0, 6).map((m) => (
              <TVMatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {/* Popular channels */}
      <section className="tv-section">
        <div className="tv-section-header">
          <div className="tv-section-title">
            <Tv className="h-5 w-5" style={{ color: '#10b981' }} />
            Popular Channels
            {!loadingFeatured && featuredChannels.length > 0 && (
              <span className="tv-section-count">{featuredChannels.length}</span>
            )}
          </div>
          <button
            className="tv-section-link tv-focusable"
            data-tv-focus
            onClick={() => setCurrentPage('live')}
          >
            View All <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {loadingFeatured ? (
          <div className="tv-grid-channels">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="tv-channel-card"
                style={{ opacity: 0.6 }}
              >
                <div
                  className="tv-skeleton"
                  style={{ width: '5.5rem', height: '5.5rem', borderRadius: '0.875rem' }}
                />
                <div className="tv-skeleton" style={{ width: '60%', height: '1rem' }} />
              </div>
            ))}
          </div>
        ) : featuredChannels.length === 0 ? (
          <div className="tv-empty">
            <Tv className="h-10 w-10" style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
            <div className="tv-empty-title">No channels available</div>
            <div>Channels will appear here when added.</div>
          </div>
        ) : (
          <div className="tv-grid-channels">
            {featuredChannels.slice(0, 14).map((c) => (
              <TVChannelCard key={c.id} channel={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ── TV match card (compact, focusable) ──
function TVMatchCard({ match }: { match: Match }) {
  const { setCurrentPage, setCurrentChannelId } = useAppStore()
  const open = () => {
    setCurrentChannelId(match.id)
    setCurrentPage('watch')
  }
  const isLive = match.status === 'live'
  const start = new Date(match.startTime)
  const timeStr = start.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <div
      className="tv-match-card tv-focusable"
      data-tv-focus
      onClick={open}
      role="button"
      tabIndex={0}
      aria-label={match.title}
    >
      <div className="tv-match-header">
        <span className="tv-match-league">{match.league || match.sport}</span>
        <span className={`tv-match-status ${isLive ? 'tv-match-status-live' : 'tv-match-status-upcoming'}`}>
          {isLive ? 'Live' : 'Soon'}
        </span>
      </div>
      <div className="tv-match-teams">
        <div className="tv-match-team">
          <div className="tv-match-team-logo">
            {match.teamALogo ? (

              <img
                src={match.teamALogo}
                alt=""
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : null}
          </div>
          <span className="tv-match-team-name">{match.teamA}</span>
        </div>
        <span className="tv-match-vs">VS</span>
        <div className="tv-match-team">
          <div className="tv-match-team-logo">
            {match.teamBLogo ? (

              <img
                src={match.teamBLogo}
                alt=""
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : null}
          </div>
          <span className="tv-match-team-name">{match.teamB}</span>
        </div>
      </div>
      <div className="tv-match-footer">
        <span>{timeStr}</span>
        <span>{match.sport}</span>
      </div>
    </div>
  )
}

function TVMatchSkeleton() {
  return (
    <div className="tv-grid-matches">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="tv-match-card" style={{ opacity: 0.6 }}>
          <div className="tv-match-header">
            <div className="tv-skeleton" style={{ width: '6rem', height: '0.875rem' }} />
            <div className="tv-skeleton" style={{ width: '3rem', height: '1rem', borderRadius: '0.375rem' }} />
          </div>
          <div className="tv-match-teams">
            <div className="tv-match-team">
              <div className="tv-skeleton" style={{ width: '3rem', height: '3rem', borderRadius: '9999px' }} />
              <div className="tv-skeleton" style={{ width: '4rem', height: '0.875rem' }} />
            </div>
            <div className="tv-skeleton" style={{ width: '1.5rem', height: '0.75rem' }} />
            <div className="tv-match-team">
              <div className="tv-skeleton" style={{ width: '3rem', height: '3rem', borderRadius: '9999px' }} />
              <div className="tv-skeleton" style={{ width: '4rem', height: '0.875rem' }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
