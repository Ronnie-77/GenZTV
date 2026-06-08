'use client'

import { useState, useEffect } from 'react'
import { Tv, Trophy, Eye, Heart, Radio, Clock, TrendingUp, Plus, Database, RefreshCw, Bell, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/lib/store'
import { fetchChannels, fetchMatches, fetchCategories, sendPushNotification, type Channel, type Match, type Category } from '@/lib/api'
import { toast } from 'sonner'

export function AdminDashboard() {
  const { setAdminPage } = useAppStore()
  const [channels, setChannels] = useState<Channel[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null)
  const [sendingTest, setSendingTest] = useState(false)

  const loadData = async () => {
    try {
      setLoading(true)
      const [ch, mt, ct] = await Promise.all([
        fetchChannels({ category: '', includeInactive: true }).catch(() => [] as Channel[]),
        fetchMatches().catch(() => [] as Match[]),
        fetchCategories().catch(() => [] as Category[]),
      ])
      setChannels(ch)
      setMatches(mt)
      setCategories(ct)
      // Load subscriber count
      fetch('/api/push/subscribers')
        .then(r => r.json())
        .then(data => setSubscriberCount(data.count))
        .catch(() => {})
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const liveMatches = matches.filter(m => m.status === 'live')
  const upcomingMatches = matches.filter(m => m.status === 'upcoming')
  const totalViews = channels.reduce((acc, ch) => acc + ch.viewCount, 0)
  const favCount = (() => {
    if (typeof window === 'undefined') return 0
    try {
      return JSON.parse(localStorage.getItem('zeng-favorites') || '[]').length
    } catch { return 0 }
  })()

  const handleSeed = async () => {
    setSeeding(true)
    try {
      const res = await fetch('/api/seed', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        toast.success('Database Seeded', { description: `Created ${data.categories} categories, ${data.channels} channels, ${data.matches} matches` })
        await loadData()
      } else {
        toast.error('Failed to seed', { description: data.error || 'Unknown error' })
      }
    } catch {
      toast.error('Failed to seed database')
    } finally {
      setSeeding(false)
    }
  }

  const handleTestNotification = async () => {
    setSendingTest(true)
    try {
      const result = await sendPushNotification({
        title: '🧪 Test Notification',
        body: 'This is a test notification from GenZ TV Admin Panel!',
        url: '/',
        tag: 'test-notification',
      })
      toast.success('Test Notification Sent', { description: `Sent: ${result.sent}, Failed: ${result.failed}` })
    } catch (err) {
      toast.error('Failed to send test notification', { description: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setSendingTest(false)
    }
  }

  const stats = [
    { icon: Tv, label: 'Total Channels', value: channels.length, color: 'text-primary', bgColor: 'bg-primary/10' },
    { icon: Radio, label: 'Live Now', value: liveMatches.length, color: 'text-zeng-live', bgColor: 'bg-red-500/10' },
    { icon: Eye, label: 'Total Views', value: totalViews.toLocaleString(), color: 'text-zeng-accent2', bgColor: 'bg-cyan-500/10' },
    { icon: Heart, label: 'Favorites', value: favCount, color: 'text-zeng-gold', bgColor: 'bg-yellow-500/10' },
  ]

  const quickActions = [
    { label: 'Add Channel', icon: Plus, page: 'channels' as const, color: 'text-primary' },
    { label: 'Add Match', icon: Trophy, page: 'matches' as const, color: 'text-zeng-gold' },
    { label: 'Manage Categories', icon: Database, page: 'categories' as const, color: 'text-zeng-accent2' },
  ]

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="bg-card rounded-2xl border border-border p-4 card-hover">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${stat.bgColor} ${stat.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{loading ? '—' : stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Notification Subscribers Card */}
      <div className="bg-card rounded-2xl border border-border p-4 card-hover">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{subscriberCount ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Push Notification Subscribers</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestNotification}
            disabled={sendingTest || (subscriberCount ?? 0) === 0}
            className="gap-1.5 btn-press"
          >
            <Send className={`h-3.5 w-3.5 ${sendingTest ? 'animate-pulse' : ''}`} />
            {sendingTest ? 'Sending...' : 'Send Test'}
          </Button>
        </div>
        {(subscriberCount ?? 0) === 0 && (
          <p className="text-xs text-muted-foreground mt-2 ml-11">
            No subscribers yet. Users will be prompted to enable notifications when they visit the app.
          </p>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {quickActions.map((action) => {
          const Icon = action.icon
          return (
            <Button
              key={action.label}
              variant="outline"
              onClick={() => setAdminPage(action.page)}
              className="h-auto py-4 flex flex-col gap-2 bg-card border-border hover:bg-secondary/50 btn-press"
            >
              <Icon className={`h-6 w-6 ${action.color}`} />
              <span className="text-sm font-medium">{action.label}</span>
            </Button>
          )
        })}
      </div>

      {/* Quick Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Categories</span>
          </div>
          <div className="space-y-1.5">
            {categories.slice(0, 6).map(cat => (
              <div key={cat.id} className="flex items-center justify-between text-xs">
                <span>{cat.icon} {cat.name}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5">
                  {channels.filter(ch => ch.category === cat.name.toLowerCase()).length}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Radio className="h-4 w-4 text-zeng-live" />
            <span className="text-sm font-semibold">Live Matches</span>
          </div>
          {liveMatches.length === 0 ? (
            <p className="text-xs text-muted-foreground">No live matches right now</p>
          ) : (
            <div className="space-y-1.5">
              {liveMatches.map(match => (
                <div key={match.id} className="flex items-center justify-between text-xs">
                  <span className="truncate flex-1">{match.teamA} vs {match.teamB}</span>
                  <Badge className="bg-red-500/20 text-red-400 text-[10px] px-1.5 animate-live-pulse">LIVE</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-zeng-gold" />
            <span className="text-sm font-semibold">Upcoming</span>
          </div>
          {upcomingMatches.length === 0 ? (
            <p className="text-xs text-muted-foreground">No upcoming matches</p>
          ) : (
            <div className="space-y-1.5">
              {upcomingMatches.slice(0, 4).map(match => (
                <div key={match.id} className="flex items-center justify-between text-xs">
                  <span className="truncate flex-1">{match.teamA} vs {match.teamB}</span>
                  <Badge className="bg-yellow-500/20 text-yellow-400 text-[10px] px-1.5">
                    {new Date(match.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Matches Table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-lg font-bold">Recent Matches</h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              className="gap-1.5 btn-press"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setAdminPage('matches')}
              className="gap-1.5 btn-press"
            >
              View All
            </Button>
          </div>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>
        ) : matches.length === 0 ? (
          <div className="p-8 text-center">
            <Trophy className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">No matches found. Add matches from the Matches section.</p>
            <Button variant="outline" size="sm" onClick={handleSeed} disabled={seeding} className="gap-1.5">
              <Database className="h-3.5 w-3.5" />
              {seeding ? 'Seeding...' : 'Seed Demo Data'}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Match</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Sport</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">League</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Start Time</th>
                </tr>
              </thead>
              <tbody>
                {matches.slice(0, 8).map((match) => (
                  <tr key={match.id} className="border-t border-border hover:bg-secondary/30 transition-colors">
                    <td className="p-3 text-sm">
                      <div className="flex items-center gap-1.5">
                        {match.teamALogo && match.teamALogo.startsWith('http') ? (
                          <img src={match.teamALogo} alt={match.teamA} className="w-5 h-5 object-contain rounded-full" />
                        ) : match.teamALogo ? (
                          <span className="text-base leading-none">{match.teamALogo}</span>
                        ) : null}
                        <span className="truncate">{match.teamA}</span>
                        <span className="text-muted-foreground">vs</span>
                        {match.teamBLogo && match.teamBLogo.startsWith('http') ? (
                          <img src={match.teamBLogo} alt={match.teamB} className="w-5 h-5 object-contain rounded-full" />
                        ) : match.teamBLogo ? (
                          <span className="text-base leading-none">{match.teamBLogo}</span>
                        ) : null}
                        <span className="truncate">{match.teamB}</span>
                      </div>
                    </td>
                    <td className="p-3 text-sm capitalize">{match.sport === 'cricket' ? '🏏' : '⚽'} {match.sport}</td>
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
                      {new Date(match.startTime).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Seed Data Button (shown when no data) */}
      {channels.length === 0 && !loading && (
        <div className="text-center pt-2">
          <Button onClick={handleSeed} disabled={seeding} className="gap-2 btn-press">
            <Database className="h-4 w-4" />
            {seeding ? 'Seeding Demo Data...' : 'Seed Demo Data'}
          </Button>
        </div>
      )}
    </div>
  )
}
