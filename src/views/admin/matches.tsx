'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trophy, Edit, Trash2, X, Check, RefreshCw, Play, Pencil, Tv, Calendar, Radio, Clock, Sparkles, Users, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { fetchMatches, fetchChannels, createMatch, updateMatch, deleteMatch, type Match, type MatchStream, type Channel } from '@/lib/api'
import { searchTeams, type TeamEntry } from '@/lib/teams-data'
import { toast } from 'sonner'

// ─── Timezone helpers for admin ───
// Admin always inputs times in Bangladesh timezone (Asia/Dhaka)
const ADMIN_TIMEZONE = 'Asia/Dhaka'

/** Convert a datetime-local value (from HTML input) in admin timezone to UTC ISO string */
function adminLocalToUTC(dtLocalValue: string): string {
  if (!dtLocalValue) return ''
  // datetime-local gives "YYYY-MM-DDTHH:mm" — interpret as Asia/Dhaka
  // Get the offset for Asia/Dhaka at this specific date
  const date = new Date(dtLocalValue)
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' })
  const dhakaStr = date.toLocaleString('en-US', { timeZone: ADMIN_TIMEZONE })
  const utcMs = new Date(utcStr).getTime()
  const dhakaMs = new Date(dhakaStr).getTime()
  const offsetMs = dhakaMs - utcMs // positive for east of UTC (+6h = +360min)
  // The datetime-local value is what the admin entered as Dhaka time
  // But the browser interpreted it as local time. We need to convert:
  // If browser is in UTC and admin enters 11:00, browser makes Date(11:00 UTC)
  // But admin meant 11:00 Dhaka = 05:00 UTC
  // So we subtract the offset between Dhaka and the browser's timezone
  const browserOffsetMs = date.getTimezoneOffset() * -60000 // browser's offset from UTC in ms
  const dhakaOffsetMs = offsetMs // Dhaka's offset from UTC in ms
  const adjustmentMs = browserOffsetMs - dhakaOffsetMs
  const adjusted = new Date(date.getTime() - adjustmentMs)
  return adjusted.toISOString()
}

/** Convert a UTC ISO string from the database to admin timezone datetime-local value */
function utcToAdminLocal(utcDateStr: string): string {
  if (!utcDateStr) return ''
  const date = new Date(utcDateStr)
  // Format in Asia/Dhaka timezone as YYYY-MM-DDTHH:mm
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: ADMIN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  // sv-SE locale gives "YYYY-MM-DD HH:mm"
  const formatted = formatter.format(date)
  return formatted.replace(' ', 'T')
}

/** Format a UTC date in admin timezone for display */
function formatAdminTime(utcDateStr: string): string {
  if (!utcDateStr) return 'Not set'
  const date = new Date(utcDateStr)
  return date.toLocaleString('en-US', {
    timeZone: ADMIN_TIMEZONE,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Get the current UTC offset string for admin timezone */
function getAdminOffset(): string {
  const date = new Date()
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' })
  const dhakaStr = date.toLocaleString('en-US', { timeZone: ADMIN_TIMEZONE })
  const diff = (new Date(dhakaStr).getTime() - new Date(utcStr).getTime()) / 60000
  const sign = diff >= 0 ? '+' : '-'
  const absDiff = Math.abs(diff)
  const hours = Math.floor(absDiff / 60)
  const mins = absDiff % 60
  return mins > 0 ? `UTC${sign}${hours}:${String(mins).padStart(2, '0')}` : `UTC${sign}${hours}`
}

// ─── Logo renderer helper ───
function TeamLogo({ logo, name, size = 'sm' }: { logo: string; name: string; size?: 'xs' | 'sm' | 'md' }) {
  const sizeClasses = {
    xs: 'w-5 h-5 text-[10px]',
    sm: 'w-7 h-7 text-xs',
    md: 'w-10 h-10 text-lg',
  }
  const [erroredUrls, setErroredUrls] = useState<Set<string>>(() => new Set())
  const isUrl = logo?.startsWith('http')
  const hasError = isUrl && erroredUrls.has(logo)

  const handleImgError = () => {
    if (logo) {
      setErroredUrls(prev => {
        const next = new Set(prev)
        next.add(logo)
        return next
      })
    }
  }

  return (
    <div className={`${sizeClasses[size]} rounded-md border border-border bg-secondary flex items-center justify-center overflow-hidden shrink-0`}>
      {isUrl && !hasError ? (
        <img
          src={logo}
          alt={name}
          className="w-full h-full object-contain p-0.5"
          onError={handleImgError}
        />
      ) : logo && !isUrl ? (
        <span className="leading-none">{logo}</span>
      ) : (
        <span className="font-bold" style={{ fontSize: 'inherit' }}>{name?.charAt(0) || '?'}</span>
      )}
    </div>
  )
}

// ─── Team Autocomplete Input ───
function TeamInput({ label, value, logo, sport, onNameChange, onLogoChange }: {
  label: string
  value: string
  logo: string
  sport: string
  onNameChange: (val: string) => void
  onLogoChange: (val: string) => void
}) {
  const [suggestions, setSuggestions] = useState<TeamEntry[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [editingLogo, setEditingLogo] = useState(false)
  const [logoEditValue, setLogoEditValue] = useState(logo)

  const handleInput = (val: string) => {
    onNameChange(val)
    if (val.length > 0) {
      const results = searchTeams(val, sport, 8)
      setSuggestions(results)
      setShowSuggestions(results.length > 0)
    } else {
      setShowSuggestions(false)
    }
  }

  const selectTeam = (team: TeamEntry) => {
    onNameChange(team.name)
    onLogoChange(team.logo)
    setLogoEditValue(team.logo)
    setShowSuggestions(false)
  }

  const handleFocus = () => {
    if (value.length > 0) {
      const results = searchTeams(value, sport, 8)
      setSuggestions(results)
      setShowSuggestions(results.length > 0)
    } else {
      const results = searchTeams('', sport, 8)
      setSuggestions(results)
      setShowSuggestions(true)
    }
  }

  const isUrl = (str: string) => str.startsWith('http')

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className="flex gap-2">
        <div className="relative group">
          <TeamLogo logo={logo} name={value} size="md" />
          <button
            type="button"
            onClick={() => { setEditingLogo(!editingLogo); setLogoEditValue(logo) }}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            title="Edit logo URL"
          >
            <Pencil className="h-2.5 w-2.5" />
          </button>
        </div>
        <div className="relative flex-1">
          <Input
            value={value}
            onChange={(e) => handleInput(e.target.value)}
            onFocus={handleFocus}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder={`Type ${sport === 'cricket' ? 'country' : 'team'} name...`}
            className="h-10"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-30 bg-popover border border-border rounded-lg shadow-xl mt-1 overflow-hidden max-h-64 overflow-y-auto">
              {suggestions.map((team, idx) => (
                <button
                  key={`${team.name}-${idx}`}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-secondary transition-colors text-left"
                  onMouseDown={() => selectTeam(team)}
                >
                  {isUrl(team.logo) ? (
                    <img
                      src={team.logo}
                      alt={team.name}
                      className="w-6 h-6 object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  ) : (
                    <span className="text-base w-6 text-center">{team.logo}</span>
                  )}
                  <span className="flex-1">{team.name}</span>
                  <span className="text-[10px] text-muted-foreground uppercase px-1.5 py-0.5 rounded bg-secondary">
                    {team.type === 'club' ? 'Club' : 'National'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {editingLogo && (
        <div className="flex gap-2 items-center pl-12">
          <Input
            value={logoEditValue}
            onChange={(e) => setLogoEditValue(e.target.value)}
            placeholder="Logo URL or emoji..."
            className="h-7 text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 shrink-0"
            onClick={() => {
              onLogoChange(logoEditValue)
              setEditingLogo(false)
            }}
          >
            <Check className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 shrink-0"
            onClick={() => setEditingLogo(false)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Stream Input ───
interface StreamForm {
  name: string
  channel: string
  channelId: string
  type: 'iframe' | 'direct' | 'redirect'
  url: string
}

function StreamInput({ stream, onUpdate, onRemove, channels, index }: {
  stream: StreamForm
  onUpdate: (s: StreamForm) => void
  onRemove: () => void
  channels: Channel[]
  index: number
}) {
  const [showChannelPicker, setShowChannelPicker] = useState(false)
  const [channelSearch, setChannelSearch] = useState('')

  const filteredChannels = channelSearch.trim()
    ? channels.filter(c =>
        c.name.toLowerCase().includes(channelSearch.toLowerCase()) ||
        c.tags.toLowerCase().includes(channelSearch.toLowerCase())
      )
    : channels

  const handleSelectChannel = (ch: Channel) => {
    let streamType: StreamForm['type'] = 'iframe'
    if (ch.streamType === 'm3u') streamType = 'direct'
    else if (ch.streamType === 'iframe') streamType = 'iframe'
    else if (ch.streamType === 'redirect') streamType = 'redirect'

    onUpdate({
      ...stream,
      name: ch.name,
      channel: ch.name,
      channelId: ch.id,
      type: streamType,
      url: ch.streamUrl,
    })
    setShowChannelPicker(false)
    setChannelSearch('')
  }

  return (
    <div className="relative p-3 bg-secondary/20 rounded-xl border border-border/50 hover:border-border transition-colors">
      {/* Stream header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-secondary px-2 py-0.5 rounded">
            Stream {index + 1}
          </span>
          {stream.channel && (
            <div className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              <Tv className="h-2.5 w-2.5" />
              <span className="font-medium max-w-[120px] truncate">{stream.channel}</span>
              <button
                type="button"
                onClick={() => onUpdate({ ...stream, channel: '', channelId: '', name: stream.name === stream.channel ? '' : stream.name })}
                className="ml-0.5 hover:text-destructive transition-colors"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] gap-1 px-2"
            onClick={() => setShowChannelPicker(!showChannelPicker)}
          >
            <Tv className="h-3 w-3" />
            Pick Channel
          </Button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Channel picker dropdown */}
      {showChannelPicker && (
        <div className="mb-2 relative">
          <div className="bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
            <div className="p-2 border-b border-border">
              <Input
                value={channelSearch}
                onChange={(e) => setChannelSearch(e.target.value)}
                placeholder="Search channels..."
                className="h-7 text-xs"
                autoFocus
              />
            </div>
            <div className="max-h-40 overflow-y-auto">
              {filteredChannels.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground text-center">No channels found</div>
              ) : (
                filteredChannels.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-secondary transition-colors text-left"
                    onMouseDown={() => handleSelectChannel(ch)}
                  >
                    <div className="w-5 h-5 rounded overflow-hidden bg-secondary flex items-center justify-center shrink-0">
                      {ch.logo ? (
                        <img
                          src={ch.logo}
                          alt={ch.name}
                          className="w-full h-full object-contain p-0.5"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                            const parent = (e.target as HTMLImageElement).parentElement!
                            parent.innerHTML = '<span class="text-[8px]">📺</span>'
                          }}
                        />
                      ) : (
                        <span className="text-[8px]">📺</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{ch.name}</div>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded capitalize ${
                      ch.streamType === 'iframe' ? 'bg-blue-500/10 text-blue-400' :
                      ch.streamType === 'm3u' ? 'bg-green-500/10 text-green-400' :
                      'bg-orange-500/10 text-orange-400'
                    }`}>
                      {ch.streamType}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stream fields */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2">
        <Input
          placeholder="Stream name"
          value={stream.name}
          onChange={(e) => onUpdate({ ...stream, name: e.target.value })}
          className="h-8 text-xs"
        />
        <select
          value={stream.type}
          onChange={(e) => onUpdate({ ...stream, type: e.target.value as StreamForm['type'] })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs min-w-[100px]"
        >
          <option value="iframe">iFrame</option>
          <option value="direct">Direct (M3U8)</option>
          <option value="redirect">Redirect</option>
        </select>
        <Input
          placeholder="Stream URL"
          value={stream.url}
          onChange={(e) => onUpdate({ ...stream, url: e.target.value })}
          className="h-8 text-xs"
        />
      </div>
    </div>
  )
}

// ─── Section Divider ───
function FormSection({ icon, title, description, children, badge }: { icon: React.ReactNode; title: string; description?: string; children: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/10 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            {icon}
          </div>
          <div>
            <h4 className="text-sm font-bold leading-tight">{title}</h4>
            {description && <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>}
          </div>
        </div>
        {badge}
      </div>
      <div className="pl-9">
        {children}
      </div>
    </div>
  )
}

// ─── Match Preview Card ───
function MatchPreview({ teamA, teamALogo, teamB, teamBLogo, league, sport, startTime, status }: {
  teamA: string; teamALogo: string; teamB: string; teamBLogo: string
  league: string; sport: string; startTime: string; status: string
}) {
  const sportIcon = sport === 'cricket' ? '🏏' : '⚽'
  const formatTime = (d: string) => {
    if (!d) return 'Not set'
    // d is a datetime-local value — show it as-is since it's already in admin timezone
    try {
      const date = new Date(d)
      return date.toLocaleString('en-US', {
        timeZone: ADMIN_TIMEZONE,
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      })
    } catch {
      return d
    }
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 p-4">
      <div className="text-center mb-3">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
          Match Preview
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        {/* Team A */}
        <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
          <TeamLogo logo={teamALogo} name={teamA || '?'} size="md" />
          <span className="text-sm font-bold text-center truncate w-full">{teamA || 'Team A'}</span>
        </div>
        {/* VS */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <span className="text-lg font-black text-muted-foreground">VS</span>
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
            {sportIcon} {sport || 'football'}
          </Badge>
        </div>
        {/* Team B */}
        <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
          <TeamLogo logo={teamBLogo} name={teamB || '?'} size="md" />
          <span className="text-sm font-bold text-center truncate w-full">{teamB || 'Team B'}</span>
        </div>
      </div>
      {(league || startTime) && (
        <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
          {league && <span>{league}</span>}
          {league && startTime && <span>•</span>}
          {startTime && (
            <span className="flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {formatTime(startTime)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Admin Matches Page ───
export function AdminMatches() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [filterSport, setFilterSport] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [sportType, setSportType] = useState('football')
  const [league, setLeague] = useState('')
  const [teamAName, setTeamAName] = useState('')
  const [teamALogo, setTeamALogo] = useState('')
  const [teamBName, setTeamBName] = useState('')
  const [teamBLogo, setTeamBLogo] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [status, setStatus] = useState('upcoming')
  const [featured, setFeatured] = useState(false)
  const [streams, setStreams] = useState<StreamForm[]>([
    { name: 'Stream 1', channel: '', channelId: '', type: 'iframe', url: '' }
  ])

  // Channels for stream selection
  const [allChannels, setAllChannels] = useState<Channel[]>([])

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Filter channels by sport type
  const sportFilteredChannels = allChannels.filter(ch => {
    if (sportType === 'football') {
      return ch.category === 'football' || ch.category === 'sports'
    }
    if (sportType === 'cricket') {
      return ch.category === 'cricket' || ch.category === 'sports'
    }
    return ch.category === 'sports'
  })

  const loadMatches = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchMatches({
        ...(filterSport !== 'all' ? { sport: filterSport } : {}),
        ...(filterStatus !== 'all' ? { status: filterStatus } : {}),
      })
      setMatches(data)
    } catch {
      toast.error('Error', { description: 'Failed to load matches' })
    } finally {
      setLoading(false)
    }
  }, [filterSport, filterStatus])

  const loadChannels = useCallback(async () => {
    try {
      const data = await fetchChannels({ includeInactive: true })
      setAllChannels(data)
    } catch {
      // Channels loading failure is non-critical
    }
  }, [])

  useEffect(() => {
    loadMatches()
  }, [loadMatches])

  useEffect(() => {
    loadChannels()
  }, [loadChannels])

  const resetForm = () => {
    setSportType('football')
    setLeague('')
    setTeamAName('')
    setTeamALogo('')
    setTeamBName('')
    setTeamBLogo('')
    setStartTime('')
    setEndTime('')
    setStatus('upcoming')
    setFeatured(false)
    setStreams([{ name: 'Stream 1', channel: '', channelId: '', type: 'iframe', url: '' }])
  }

  const handleEdit = (match: Match) => {
    setEditingId(match.id)
    setSportType(match.sport)
    setLeague(match.league)
    setTeamAName(match.teamA)
    setTeamALogo(match.teamALogo)
    setTeamBName(match.teamB)
    setTeamBLogo(match.teamBLogo)
    setStartTime(utcToAdminLocal(match.startTime))
    setEndTime(match.endTime ? utcToAdminLocal(match.endTime) : '')
    setStatus(match.status)
    setFeatured(match.isFeatured)
    setStreams(match.streams.map(s => ({
      name: s.name,
      channel: s.channel,
      channelId: '',
      type: s.type as 'iframe' | 'direct' | 'redirect',
      url: s.url,
    })))
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!teamAName.trim() || !teamBName.trim()) {
      toast.error('Validation Error', { description: 'Both team names are required' })
      return
    }
    if (!startTime) {
      toast.error('Validation Error', { description: 'Start time is required' })
      return
    }

    setSaving(true)
    try {
      const data = {
        sport: sportType,
        teamA: teamAName,
        teamALogo,
        teamB: teamBName,
        teamBLogo,
        league,
        startTime: adminLocalToUTC(startTime),
        endTime: endTime ? adminLocalToUTC(endTime) : undefined,
        status,
        isFeatured: featured,
        streams: streams.map(s => ({
          name: s.name || 'Stream 1',
          channel: s.channel,
          type: s.type,
          url: s.url,
        })),
      }

      if (editingId) {
        await updateMatch(editingId, data)
        toast.success('Match Updated', { description: `${teamAName} vs ${teamBName} updated successfully` })
      } else {
        await createMatch(data)
        toast.success('Match Created', { description: `${teamAName} vs ${teamBName} created successfully` })
      }

      setShowForm(false)
      setEditingId(null)
      resetForm()
      loadMatches()
    } catch {
      toast.error('Error', { description: 'Failed to save match' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteMatch(id)
      toast.success('Match Deleted', { description: 'Match has been removed' })
      setDeleteConfirm(null)
      loadMatches()
    } catch {
      toast.error('Error', { description: 'Failed to delete match' })
    }
  }

  const handleQuickStatus = async (match: Match, newStatus: string) => {
    try {
      await updateMatch(match.id, { status: newStatus })
      toast.success('Status Updated', { description: `Match is now ${newStatus}` })
      loadMatches()
    } catch {
      toast.error('Error', { description: 'Failed to update status' })
    }
  }

  const addStream = () => {
    setStreams([...streams, { name: `Stream ${streams.length + 1}`, channel: '', channelId: '', type: 'iframe', url: '' }])
  }

  const updateStream = (index: number, updated: StreamForm) => {
    const newStreams = [...streams]
    newStreams[index] = updated
    setStreams(newStreams)
  }

  const removeStream = (index: number) => {
    if (streams.length > 1) {
      setStreams(streams.filter((_, i) => i !== index))
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <select
            value={filterSport}
            onChange={(e) => setFilterSport(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All Sports</option>
            <option value="cricket">🏏 Cricket</option>
            <option value="football">⚽ Football</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All Status</option>
            <option value="live">🔴 Live</option>
            <option value="upcoming">🕐 Upcoming</option>
            <option value="ended">✅ Ended</option>
          </select>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={loadMatches}
            className="gap-1.5 btn-press"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            onClick={() => {
              setEditingId(null)
              resetForm()
              setShowForm(!showForm)
            }}
            className="gap-2 btn-press"
          >
            <Plus className="h-4 w-4" />
            Add Match
          </Button>
        </div>
      </div>

      {/* Add/Edit Match Form */}
      {showForm && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden animate-fade-slide">
          {/* Form Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-gradient-to-r from-secondary/40 to-secondary/20">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Trophy className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold">{editingId ? 'Edit Match' : 'Add New Match'}</h3>
                <p className="text-[10px] text-muted-foreground">Fill in the details — preview updates live</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setShowForm(false); setEditingId(null); resetForm() }}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Form Body */}
          <div className="p-5 space-y-5">

            {/* ── Match Preview ── */}
            <MatchPreview
              teamA={teamAName}
              teamALogo={teamALogo}
              teamB={teamBName}
              teamBLogo={teamBLogo}
              league={league}
              sport={sportType}
              startTime={startTime}
              status={status}
            />

            {/* ── Sport & League ── */}
            <FormSection
              icon={<Radio className="h-3.5 w-3.5" />}
              title="Sport & League"
              description="Choose the sport type and competition name"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Sport Type</label>
                  <select
                    value={sportType}
                    onChange={(e) => {
                      setSportType(e.target.value)
                      setTeamAName('')
                      setTeamALogo('')
                      setTeamBName('')
                      setTeamBLogo('')
                    }}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="football">⚽ Football</option>
                    <option value="cricket">🏏 Cricket</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">League / Competition</label>
                  <Input
                    value={league}
                    onChange={(e) => setLeague(e.target.value)}
                    placeholder="e.g. Premier League, ICC World Cup"
                    className="h-9"
                  />
                </div>
              </div>
            </FormSection>

            {/* ── Teams ── */}
            <FormSection
              icon={<Users className="h-3.5 w-3.5" />}
              title="Teams"
              description="Search and select teams — logos will auto-fill"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TeamInput
                  label="Team A (Home)"
                  value={teamAName}
                  logo={teamALogo}
                  sport={sportType}
                  onNameChange={setTeamAName}
                  onLogoChange={setTeamALogo}
                />
                <TeamInput
                  label="Team B (Away)"
                  value={teamBName}
                  logo={teamBLogo}
                  sport={sportType}
                  onNameChange={setTeamBName}
                  onLogoChange={setTeamBLogo}
                />
              </div>
            </FormSection>

            {/* ── Schedule & Status ── */}
            <FormSection
              icon={<Calendar className="h-3.5 w-3.5" />}
              title="Schedule & Status"
              description={`All times in Bangladesh timezone (BST, ${getAdminOffset()}) — displayed in user's local timezone on home page`}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                    Start Time *
                    <span className="text-[9px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded">BST ({getAdminOffset()})</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                    End Time
                    <span className="text-[9px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded">BST</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Match auto-ends when time passes</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="upcoming">🕐 Upcoming</option>
                    <option value="live">🔴 Live</option>
                    <option value="ended">✅ Ended</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Switch
                  checked={featured}
                  onCheckedChange={setFeatured}
                />
                <label className="text-xs font-medium flex items-center gap-1">
                  <Star className="h-3 w-3 text-zeng-gold fill-zeng-gold" />
                  Featured Match
                </label>
              </div>
            </FormSection>

            {/* ── Streams ── */}
            <FormSection
              icon={<Tv className="h-3.5 w-3.5" />}
              title="Streams"
              description="Add streaming sources — pick from channels or add custom URLs"
              badge={
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <Sparkles className="h-2.5 w-2.5" />
                  {streams.length} {streams.length === 1 ? 'stream' : 'streams'}
                </Badge>
              }
            >
              <div className="space-y-2">
                {streams.map((stream, index) => (
                  <StreamInput
                    key={index}
                    stream={stream}
                    index={index}
                    onUpdate={(s) => updateStream(index, s)}
                    onRemove={() => removeStream(index)}
                    channels={sportFilteredChannels}
                  />
                ))}
                <Button
                  variant="dashed"
                  size="sm"
                  onClick={addStream}
                  className="w-full h-9 text-xs gap-1.5 border-dashed border-2 hover:border-primary/50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Another Stream
                </Button>
              </div>
            </FormSection>
          </div>

          {/* Form Footer */}
          <div className="flex gap-2 justify-end px-5 py-3.5 border-t border-border bg-gradient-to-r from-secondary/20 to-secondary/10">
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setEditingId(null); resetForm() }} className="gap-1.5">
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="btn-press gap-2 min-w-[140px]">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? 'Saving...' : editingId ? 'Update Match' : 'Create Match'}
            </Button>
          </div>
        </div>
      )}

      {/* Matches Table */}
      {loading ? (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <RefreshCw className="h-8 w-8 text-muted-foreground mx-auto mb-3 animate-spin" />
          <p className="text-sm text-muted-foreground">Loading matches...</p>
        </div>
      ) : matches.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-1">No matches found</h3>
          <p className="text-sm text-muted-foreground">Add your first match to get started.</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Match</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Sport</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">League</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Start Time <span className="text-emerald-500">(BST)</span></th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Streams</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => (
                  <tr key={match.id} className="border-t border-border hover:bg-secondary/20 transition-colors">
                    <td className="p-3 text-sm">
                      <div className="flex items-center gap-1.5">
                        <TeamLogo logo={match.teamALogo} name={match.teamA} size="xs" />
                        <span className="font-medium">{match.teamA}</span>
                        <span className="text-muted-foreground text-[10px] font-bold mx-0.5">VS</span>
                        <span className="font-medium">{match.teamB}</span>
                        <TeamLogo logo={match.teamBLogo} name={match.teamB} size="xs" />
                        {match.isFeatured && <Star className="h-3 w-3 text-zeng-gold fill-zeng-gold ml-1" />}
                      </div>
                    </td>
                    <td className="p-3 text-sm capitalize">
                      {match.sport === 'cricket' ? '🏏' : '⚽'} {match.sport}
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">{match.league || '—'}</td>
                    <td className="p-3 text-sm">
                      <Badge
                        className={`text-[10px] ${
                          match.status === 'live'
                            ? 'bg-red-500/20 text-red-400 animate-live-pulse'
                            : match.status === 'upcoming'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-secondary text-muted-foreground'
                        }`}
                      >
                        {match.status === 'live' ? '● LIVE' : match.status === 'upcoming' ? 'Upcoming' : 'Ended'}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {formatAdminTime(match.startTime)}
                    </td>
                    <td className="p-3 text-sm">
                      <Badge variant="secondary" className="text-xs">{match.streams.length}</Badge>
                    </td>
                    <td className="p-3 text-sm text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {match.status === 'upcoming' && (
                          <button
                            onClick={() => handleQuickStatus(match, 'live')}
                            className="px-2 py-1 rounded-md bg-red-500/10 text-red-400 text-xs hover:bg-red-500/20 transition-colors btn-press"
                            title="Start match"
                          >
                            <Play className="h-3 w-3" />
                          </button>
                        )}
                        {match.status === 'live' && (
                          <button
                            onClick={() => handleQuickStatus(match, 'ended')}
                            className="px-2 py-1 rounded-md bg-secondary text-muted-foreground text-xs hover:bg-secondary/80 transition-colors btn-press"
                            title="End match"
                          >
                            End
                          </button>
                        )}
                        <button
                          onClick={() => handleEdit(match)}
                          className="p-1.5 rounded-md hover:bg-secondary transition-colors btn-press"
                          title="Edit match"
                        >
                          <Edit className="h-3.5 w-3.5 text-primary" />
                        </button>
                        {deleteConfirm === match.id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleDelete(match.id)}
                              className="px-2 py-1 rounded-md bg-destructive text-destructive-foreground text-xs btn-press"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="px-2 py-1 rounded-md bg-secondary text-xs btn-press"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(match.id)}
                            className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors btn-press"
                            title="Delete match"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-border text-xs text-muted-foreground text-center">
            Showing {matches.length} match{matches.length !== 1 ? 'es' : ''}
          </div>
        </div>
      )}
    </div>
  )
}

function Star({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}
