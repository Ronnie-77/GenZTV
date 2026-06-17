import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminAuth } from '@/lib/auth'

// GET /api/analytics/dashboard — admin analytics dashboard data
// Returns REAL data only (no fake/mock). Includes daily peak concurrent
// visitors, top devices (mobile/desktop/tv) and top browsers, in addition
// to the existing views / visitors / countries / channels metrics.
export async function GET(request: NextRequest) {
  return requireAdminAuth(request, async () => {
    try {
      const now = new Date()
      const todayStr = now.toISOString().slice(0, 10)
      const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10)
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10)
      const fourteenDaysAgo = new Date(now.getTime() - 13 * 86400000).toISOString().slice(0, 10)
      const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000)

      // Fetch today's stat
      const todayStat = await db.dailyStat.findUnique({ where: { date: todayStr } })

      // Fetch yesterday's stat
      const yesterdayStat = await db.dailyStat.findUnique({ where: { date: yesterdayStr } })

      // Fetch daily chart data (14 days)
      const dailyStats = await db.dailyStat.findMany({
        where: { date: { gte: fourteenDaysAgo } },
        orderBy: { date: 'asc' },
      })

      // Aggregate 7-day stats from dailyStats we already have
      const last7DaysStats = dailyStats.filter(s => s.date >= sevenDaysAgo)
      const last7Days = {
        views: last7DaysStats.reduce((sum, s) => sum + s.totalViews, 0),
        uniqueVisitors: last7DaysStats.reduce((sum, s) => sum + s.uniqueVisitors, 0),
      }

      // For 30 days, fetch separately only if needed
      const last30DaysStats = sevenDaysAgo <= thirtyDaysAgo
        ? await db.dailyStat.findMany({ where: { date: { gte: thirtyDaysAgo } } })
        : last7DaysStats
      const last30Days = {
        views: last30DaysStats.reduce((sum, s) => sum + s.totalViews, 0),
        uniqueVisitors: last30DaysStats.reduce((sum, s) => sum + s.uniqueVisitors, 0),
      }

      // Total all time (reuse dailyStats + any older data)
      const allTimeStats = fourteenDaysAgo <= thirtyDaysAgo
        ? last30DaysStats
        : await db.dailyStat.findMany()
      const totalAllTime = fourteenDaysAgo > thirtyDaysAgo
        ? {
            views: allTimeStats.reduce((sum, s) => sum + s.totalViews, 0),
            uniqueVisitors: allTimeStats.reduce((sum, s) => sum + s.uniqueVisitors, 0),
          }
        : {
            views: last30DaysStats.reduce((sum, s) => sum + s.totalViews, 0),
            uniqueVisitors: last30DaysStats.reduce((sum, s) => sum + s.uniqueVisitors, 0),
          }

      // Online now (real: sessions active in last 5 minutes)
      const onlineNow = await db.visitorSession.count({
        where: { lastSeen: { gte: fiveMinAgo } },
      })

      // Recent page views.
      // NOTE: We intentionally do NOT use an explicit `select` here. Earlier
      // versions selected `device`, `browser`, `country` — but if a developer's
      // LOCAL Prisma client / SQLite DB hasn't been migrated to the Task-17
      // schema yet, those fields are "Unknown" and the query throws a 500.
      // Fetching all fields is safe on both old and new schemas: on old schemas
      // the new columns simply won't be present in the returned rows (we read
      // them defensively with `|| ''` below).
      let recentPageViews: Array<{
        page: string
        channelId: string | null
        createdAt: Date
        country?: string
        device?: string
        browser?: string
      }> = []
      try {
        recentPageViews = await db.pageView.findMany({
          take: 20,
          orderBy: { createdAt: 'desc' },
        }) as typeof recentPageViews
      } catch (e) {
        console.error('[Analytics] recentPageViews fetch failed (degraded):', e)
        recentPageViews = []
      }

      // Top channels all time — from all DailyStats
      const allStats = await db.dailyStat.findMany()
      const channelCounts: Record<string, number> = {}
      const deviceCounts: Record<string, number> = {}
      const browserCounts: Record<string, number> = {}
      for (const stat of allStats) {
        try {
          const ch: Record<string, number> = JSON.parse(stat.topChannels || '{}')
          for (const [id, count] of Object.entries(ch)) {
            channelCounts[id] = (channelCounts[id] || 0) + count
          }
        } catch { /* skip */ }
        try {
          const dev: Record<string, number> = JSON.parse(stat.topDevices || '{}')
          for (const [d, count] of Object.entries(dev)) {
            deviceCounts[d] = (deviceCounts[d] || 0) + count
          }
        } catch { /* skip */ }
        try {
          const br: Record<string, number> = JSON.parse(stat.topBrowsers || '{}')
          for (const [b, count] of Object.entries(br)) {
            browserCounts[b] = (browserCounts[b] || 0) + count
          }
        } catch { /* skip */ }
      }

      const topChannelIds = Object.entries(channelCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20)
        .map(([id]) => id)

      const channels = topChannelIds.length
        ? await db.channel.findMany({
            where: { id: { in: topChannelIds } },
            select: { id: true, name: true },
          })
        : []

      const channelMap = new Map(channels.map((c) => [c.id, c.name]))

      const topChannelsAllTime = Object.entries(channelCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20)
        .map(([id, views]) => ({
          id,
          name: channelMap.get(id) || 'Unknown',
          views,
        }))

      // Top devices all-time (mobile/desktop/tv)
      const topDevicesAllTime = Object.entries(deviceCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([device, count]) => ({ device, count }))

      // Top browsers all-time
      const topBrowsersAllTime = Object.entries(browserCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([browser, count]) => ({ browser, count }))

      const dailyChart = dailyStats.map((s) => ({
        date: s.date,
        views: s.totalViews,
        uniqueVisitors: s.uniqueVisitors,
        // `peakVisitors` was added in Task-17. On a DB that hasn't been
        // migrated yet the column is absent → value is undefined → fall back
        // to 0 so the chart still renders.
        peakVisitors: (s as { peakVisitors?: number }).peakVisitors || 0,
      }))

      const formatStat = (
        stat: {
          totalViews: number
          uniqueVisitors: number
          peakVisitors?: number
          topPages?: string
          topChannels?: string
          topCountries?: string
          topDevices?: string
          topBrowsers?: string
        } | null
      ) => ({
        views: stat?.totalViews || 0,
        uniqueVisitors: stat?.uniqueVisitors || 0,
        peakVisitors: stat?.peakVisitors || 0,
        topPages: JSON.parse(stat?.topPages || '{}'),
        topChannels: JSON.parse(stat?.topChannels || '{}'),
        topCountries: JSON.parse(stat?.topCountries || '{}'),
        topDevices: JSON.parse(stat?.topDevices || '{}'),
        topBrowsers: JSON.parse(stat?.topBrowsers || '{}'),
      })

      return NextResponse.json({
        today: formatStat(todayStat),
        yesterday: formatStat(yesterdayStat),
        last7Days,
        last30Days,
        totalAllTime,
        dailyChart,
        topChannelsAllTime,
        topDevicesAllTime,
        topBrowsersAllTime,
        onlineNow,
        recentPageViews: recentPageViews.map((pv) => ({
          page: pv.page,
          channelId: pv.channelId,
          createdAt: pv.createdAt.toISOString(),
          // Defensive reads — these columns may be absent on an unmigrated DB.
          country: pv.country || '',
          device: pv.device || '',
          browser: pv.browser || '',
        })),
      })
    } catch (error) {
      console.error('[Analytics] Dashboard error:', error)
      const message = error instanceof Error ? error.message : 'Failed to fetch analytics'
      return NextResponse.json(
        { error: 'Failed to fetch analytics', detail: message },
        { status: 500 }
      )
    }
  })
}
