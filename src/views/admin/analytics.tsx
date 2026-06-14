'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Eye,
  Users,
  Globe,
  Activity,
  TrendingUp,
  TrendingDown,
  Wifi,
  Clock,
  BarChart3,
  Tv,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// --- Types ---

interface DayStat {
  views: number
  uniqueVisitors: number
  topPages: Record<string, number>
  topChannels: Record<string, number>
  topCountries: Record<string, number>
}

interface DailyChartPoint {
  date: string
  views: number
  uniqueVisitors: number
}

interface TopChannelAllTime {
  id: string
  name: string
  views: number
}

interface RecentPageView {
  page: string
  channelId: string | null
  createdAt: string
}

interface AnalyticsData {
  today: DayStat
  yesterday: DayStat
  last7Days: { views: number; uniqueVisitors: number }
  last30Days: { views: number; uniqueVisitors: number }
  totalAllTime: { views: number; uniqueVisitors: number }
  dailyChart: DailyChartPoint[]
  topChannelsAllTime: TopChannelAllTime[]
  onlineNow: number
  recentPageViews: RecentPageView[]
}

// --- Helpers ---

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return n.toLocaleString()
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function viewsChangePercent(today: number, yesterday: number): number | null {
  if (yesterday === 0) return today > 0 ? null : null
  return Math.round(((today - yesterday) / yesterday) * 100)
}

// --- Component ---

export function AdminAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async (showRefreshSpinner = false) => {
    try {
      if (showRefreshSpinner) setRefreshing(true)
      else setLoading(true)
      setError(null)

      const res = await fetch('/api/analytics/dashboard')
      if (res.status === 401) {
        throw new Error('Authentication required — please log in again')
      }
      if (res.status === 503) {
        throw new Error('Analytics system is initializing — please wait a moment and retry')
      }
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        const detail = errorData.detail || errorData.error || ''
        throw new Error(`Failed to fetch analytics (${res.status})${detail ? ': ' + detail : ''}`)
      }
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(true)
    }, 30_000)
    return () => clearInterval(interval)
  }, [fetchData])

  // --- Loading state ---
  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading analytics...</p>
      </div>
    )
  }

  // --- Error state ---
  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Activity className="h-10 w-10 text-destructive" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => fetchData()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    )
  }

  if (!data) return null

  // --- Derived values ---
  const todayViewsChange = viewsChangePercent(data.today.views, data.yesterday.views)
  const maxChartViews = Math.max(...data.dailyChart.map((d) => d.views), 1)

  // Top pages sorted desc
  const topPages = Object.entries(data.today.topPages)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
  const topPagesMax = topPages.length > 0 ? topPages[0][1] : 1

  // Top channels from today
  const topChannelsToday = Object.entries(data.today.topChannels)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)

  // Top countries from today
  const topCountries = Object.entries(data.today.topCountries)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
  const topCountriesMax = topCountries.length > 0 ? topCountries[0][1] : 1

  // Recent activity (last 10)
  const recentActivity = data.recentPageViews.slice(0, 10)

  // Channel name map for topChannelsToday
  const channelNameMap = new Map(data.topChannelsAllTime.map((c) => [c.id, c.name]))

  return (
    <div className="space-y-6">
      {/* Page Title + Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Analytics</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Real-time traffic & engagement insights</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="gap-1.5 text-xs h-7"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* ─── Top Stats Row ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Online Now */}
        <div className="bg-card rounded-xl border border-border shadow-sm p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600">
              <Wifi className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold tracking-tight">{data.onlineNow}</p>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Online Now</p>
            </div>
          </div>
        </div>

        {/* Today's Views */}
        <div className="bg-card rounded-xl border border-border shadow-sm p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-teal-500/15 text-teal-600">
              <Eye className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold tracking-tight">{formatNumber(data.today.views)}</p>
                {todayViewsChange !== null && (
                  <Badge
                    variant="secondary"
                    className={`text-[10px] px-1.5 h-4 font-medium ${
                      todayViewsChange >= 0
                        ? 'bg-emerald-500/15 text-emerald-600'
                        : 'bg-red-500/15 text-red-500'
                    }`}
                  >
                    {todayViewsChange >= 0 ? (
                      <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
                    ) : (
                      <TrendingDown className="h-2.5 w-2.5 mr-0.5" />
                    )}
                    {todayViewsChange >= 0 ? '+' : ''}
                    {todayViewsChange}%
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Today&apos;s Views</p>
            </div>
          </div>
        </div>

        {/* Today's Unique Visitors */}
        <div className="bg-card rounded-xl border border-border shadow-sm p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-violet-500/15 text-violet-600">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold tracking-tight">{formatNumber(data.today.uniqueVisitors)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Today&apos;s Visitors</p>
            </div>
          </div>
        </div>

        {/* Total All-Time Views */}
        <div className="bg-card rounded-xl border border-border shadow-sm p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-600">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold tracking-tight">{formatNumber(data.totalAllTime.views)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">All-Time Views</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Views Chart ─── */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Daily Views (Last 14 Days)</h3>
        </div>
        {data.dailyChart.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">No chart data available yet</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex items-end gap-1.5 min-w-[500px]" style={{ height: 200 }}>
              {data.dailyChart.map((day) => {
                const heightPct = (day.views / maxChartViews) * 100
                return (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center gap-1 group relative"
                  >
                    {/* Tooltip */}
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-foreground text-background text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                      {formatNumber(day.views)} views · {formatNumber(day.uniqueVisitors)} visitors
                    </div>
                    {/* Bar */}
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-teal-600 to-emerald-400 transition-all duration-300 group-hover:from-teal-500 group-hover:to-emerald-300 min-h-[2px]"
                      style={{ height: `${Math.max(heightPct, 1)}%` }}
                    />
                    {/* Label */}
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatShortDate(day.date)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── Two-column layout ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column */}
        <div className="space-y-4">
          {/* Top Pages */}
          <div className="bg-card rounded-xl border border-border shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="h-4 w-4 text-teal-500" />
              <h3 className="text-sm font-semibold">Top Pages Today</h3>
            </div>
            {topPages.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No page view data yet</p>
            ) : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto custom-scrollbar">
                {topPages.map(([page, count]) => (
                  <div key={page} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate flex-1 mr-2 font-medium">{page}</span>
                      <span className="text-muted-foreground tabular-nums">{count.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-500"
                        style={{ width: `${(count / topPagesMax) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top Channels Today */}
          <div className="bg-card rounded-xl border border-border shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Tv className="h-4 w-4 text-violet-500" />
              <h3 className="text-sm font-semibold">Top Channels Today</h3>
            </div>
            {topChannelsToday.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No channel data yet</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
                {topChannelsToday.map(([channelId, count], i) => (
                  <div key={channelId} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg hover:bg-secondary/50 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-muted-foreground tabular-nums w-4 text-right">{i + 1}</span>
                      <span className="truncate font-medium">
                        {channelNameMap.get(channelId) || channelId}
                      </span>
                    </div>
                    <span className="text-muted-foreground tabular-nums ml-2">{count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Top Countries */}
          <div className="bg-card rounded-xl border border-border shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold">Top Countries Today</h3>
            </div>
            {topCountries.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No country data yet</p>
            ) : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto custom-scrollbar">
                {topCountries.map(([country, count]) => (
                  <div key={country} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{country}</span>
                      <span className="text-muted-foreground tabular-nums">{count.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-500"
                        style={{ width: `${(count / topCountriesMax) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-card rounded-xl border border-border shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-semibold">Recent Activity</h3>
            </div>
            {recentActivity.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No recent page views</p>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
                {recentActivity.map((pv, i) => (
                  <div
                    key={`${pv.createdAt}-${i}`}
                    className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg hover:bg-secondary/50 transition-colors"
                  >
                    <span className="truncate flex-1 mr-2">{pv.page}</span>
                    <span className="text-muted-foreground whitespace-nowrap">{relativeTime(pv.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── 7-Day & 30-Day Summary Cards ─── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-teal-500" />
            <h3 className="text-sm font-semibold">Last 7 Days</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xl font-bold tracking-tight">{formatNumber(data.last7Days.views)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Views</p>
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight">{formatNumber(data.last7Days.uniqueVisitors)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Unique Visitors</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Last 30 Days</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xl font-bold tracking-tight">{formatNumber(data.last30Days.views)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Views</p>
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight">{formatNumber(data.last30Days.uniqueVisitors)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Unique Visitors</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Top Channels All Time ─── */}
      {data.topChannelsAllTime.length > 0 && (
        <div className="bg-card rounded-xl border border-border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Tv className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Top Channels — All Time</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {data.topChannelsAllTime.slice(0, 9).map((ch, i) => (
              <div
                key={ch.id}
                className="flex items-center justify-between text-xs py-2 px-3 rounded-lg bg-secondary/30 hover:bg-secondary/60 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-muted-foreground tabular-nums w-4 text-right">{i + 1}</span>
                  <span className="truncate font-medium">{ch.name}</span>
                </div>
                <span className="text-muted-foreground tabular-nums ml-2">{formatNumber(ch.views)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
