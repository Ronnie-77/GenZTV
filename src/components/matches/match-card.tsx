// v16 — Timezone-aware match times
'use client'

import { useAppStore } from '@/lib/store'
import { type Match } from '@/lib/api'
import { useCountdown } from '@/lib/hooks'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MatchCardProps {
  match: Match
  variant?: 'live' | 'upcoming' | 'default'
}

function CountdownDisplay({ targetDate, label }: { targetDate: Date; label?: string }) {
  const { days, hours, mins, secs, started } = useCountdown(targetDate)

  if (started) {
    return <span className="text-[11px] text-red-500 font-bold animate-live-pulse">● LIVE</span>
  }

  const displayLabel = label || 'Starts in'

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[12px] font-bold text-red-500">{displayLabel}</span>
      {days > 0 && <span className="text-[11px] font-extrabold text-red-500">{days}d</span>}
      <div className="flex items-center gap-0.5">
        {[hours, mins, secs].map((val, i) => (
          <span key={i} className="flex items-center">
            <span className="text-[12px] font-mono font-extrabold text-red-500 px-0.5">
              {String(val).padStart(2, '0')}
            </span>
            {i < 2 && <span className="text-[10px] text-red-500 font-bold mx-0.5">:</span>}
          </span>
        ))}
      </div>
    </div>
  )
}

function formatMatchTime(dateStr: string, timezone: string) {
  const date = new Date(dateStr)
  try {
    // Use Intl.DateTimeFormat to format in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    return formatter.format(date)
  } catch {
    // Fallback to local time
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const month = months[date.getMonth()]
    const day = date.getDate()
    const hours = date.getHours()
    const minutes = date.getMinutes()
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const h = hours % 12 || 12
    const m = minutes < 10 ? `0${minutes}` : minutes
    return `${month} ${day}, ${h}:${m} ${ampm}`
  }
}

export function MatchCard({ match, variant }: MatchCardProps) {
  const { setCurrentPage, setCurrentChannelId, timezone } = useAppStore()

  // Check if an upcoming match has started (auto-transition to live)
  // Check if a live match has ended (auto-transition to ended)
  const baseStatus = variant || match.status || 'default'
  const { started: hasStarted } = useCountdown(new Date(match.startTime))
  const { started: hasEnded } = useCountdown(match.endTime ? new Date(match.endTime) : new Date('2099-12-31'))

  let status = baseStatus
  if (baseStatus === 'upcoming' && hasStarted) status = 'live'
  if ((status === 'live' || baseStatus === 'live') && match.endTime && hasEnded) status = 'ended'

  const handleWatch = () => {
    setCurrentChannelId(match.id)
    setCurrentPage('watch')
  }

  const sportIcon = match.sport === 'cricket' ? '🏏' : match.sport === 'football' ? '⚽' : '🏆'

  return (
    <div
      className={cn(
        'match-card group cursor-pointer relative overflow-hidden',
        status === 'live' && 'is-live',
        status === 'upcoming' && 'is-upcoming',
        status === 'ended' && 'is-ended',
        match.sport === 'football' && 'sport-football',
        match.sport === 'cricket' && 'sport-cricket',
      )}
      onClick={handleWatch}
    >
      {/* Decorative concentric circles - right side */}
      <div className="match-card-circles">
        <span className="match-card-circle-outer" />
        <span className="match-card-circle-inner" />
      </div>

      {/* Header: League + Status */}
      <div className="match-card-header">
        <span className="match-league">
          <span className="inline-block mr-1" style={{filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))'}}>{sportIcon}</span>{match.league || match.sport}
        </span>
        <span
          className={cn(
            'match-status',
            status === 'live' && 'live',
            status === 'upcoming' && 'upcoming',
            status === 'ended' && 'ended',
          )}
        >
          {status === 'live' ? 'LIVE' : status === 'upcoming' ? 'UPCOMING' : 'ENDED'}
        </span>
      </div>

      {/* Teams Section */}
      <div className="match-teams">
        {/* Team A */}
        <div className="match-team">
          <div className="team-logo">
            {match.teamALogo && match.teamALogo.startsWith('http') ? (
              <img
                src={match.teamALogo}
                alt={match.teamA}
                className={match.teamALogo.includes('flagcdn') ? 'team-logo-flag' : 'team-logo-img'}
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                  ;(e.target as HTMLImageElement).parentElement!.setAttribute('data-fallback', 'true')
                }}
              />
            ) : match.teamALogo ? (
              <span className="team-logo-emoji">{match.teamALogo}</span>
            ) : (
              <span className="team-logo-fallback">{match.teamA.charAt(0)}</span>
            )}
          </div>
          <span className="team-name">{match.teamA}</span>
        </div>

        {/* Center: VS or Score */}
        <div className="match-center">
          {status === 'live' ? (
            <span className="match-score">VS</span>
          ) : (
            <span className="match-vs">VS</span>
          )}
        </div>

        {/* Team B */}
        <div className="match-team">
          <div className="team-logo">
            {match.teamBLogo && match.teamBLogo.startsWith('http') ? (
              <img
                src={match.teamBLogo}
                alt={match.teamB}
                className={match.teamBLogo.includes('flagcdn') ? 'team-logo-flag' : 'team-logo-img'}
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                  ;(e.target as HTMLImageElement).parentElement!.setAttribute('data-fallback', 'true')
                }}
              />
            ) : match.teamBLogo ? (
              <span className="team-logo-emoji">{match.teamBLogo}</span>
            ) : (
              <span className="team-logo-fallback">{match.teamB.charAt(0)}</span>
            )}
          </div>
          <span className="team-name">{match.teamB}</span>
        </div>
      </div>

      {/* Footer: Time + Timer + Actions */}
      <div className="match-footer">
        <div className="match-time inline-flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-primary shrink-0" />
          <span>{formatMatchTime(match.startTime, timezone)}</span>
        </div>

        {baseStatus === 'upcoming' && !hasStarted && (
          <CountdownDisplay targetDate={new Date(match.startTime)} />
        )}

        {baseStatus === 'upcoming' && hasStarted && !hasEnded && (
          <span className="text-[11px] text-red-500 font-bold animate-live-pulse">● LIVE</span>
        )}

        {baseStatus === 'upcoming' && hasStarted && match.endTime && hasEnded && (
          <span className="text-[11px] text-muted-foreground">Match ended</span>
        )}

        {status === 'ended' && (
          <span className="text-[11px] text-muted-foreground">Match ended</span>
        )}

        {status === 'live' && match.streams.length > 0 && (
          <button
            className="watch-now-btn"
            onClick={(e) => {
              e.stopPropagation()
              handleWatch()
            }}
          >
            Watch Now
          </button>
        )}
      </div>
    </div>
  )
}
