import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminAuth } from '@/lib/auth'

// GET /api/analytics/dashboard — admin analytics dashboard data
// Uses sequential DB queries to reduce memory spikes
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
      // If we only have partial data from last30DaysStats, fetch all
      const totalAllTime = fourteenDaysAgo > thirtyDaysAgo
        ? {
            views: allTimeStats.reduce((sum, s) => sum + s.totalViews, 0),
            uniqueVisitors: allTimeStats.reduce((sum, s) => sum + s.uniqueVisitors, 0),
          }
        : {
            views: last30DaysStats.reduce((sum, s) => sum + s.totalViews, 0),
            uniqueVisitors: last30DaysStats.reduce((sum, s) => sum + s.uniqueVisitors, 0),
          }

      // Online now
      const onlineNow = await db.visitorSession.count({
        where: { lastSeen: { gte: fiveMinAgo } },
      })

      // Recent page views
      const recentPageViews = await db.pageView.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        select: { page: true, channelId: true, createdAt: true },
      })

      // Top channels all time — from all DailyStats
      const allStats = await db.dailyStat.findMany()
      const channelCounts: Record<string, number> = {}
      for (const stat of allStats) {
        try {
          const parsed: Record<string, number> = JSON.parse(stat.topChannels || '{}')
          for (const [chId, count] of Object.entries(parsed)) {
            channelCounts[chId] = (channelCounts[chId] || 0) + count
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

      const dailyChart = dailyStats.map((s) => ({
        date: s.date,
        views: s.totalViews,
        uniqueVisitors: s.uniqueVisitors,
      }))

      const formatStat = (
        stat: {
          totalViews: number
          uniqueVisitors: number
          topPages: string
          topChannels: string
          topCountries: string
        } | null
      ) => ({
        views: stat?.totalViews || 0,
        uniqueVisitors: stat?.uniqueVisitors || 0,
        topPages: JSON.parse(stat?.topPages || '{}'),
        topChannels: JSON.parse(stat?.topChannels || '{}'),
        topCountries: JSON.parse(stat?.topCountries || '{}'),
      })

      return NextResponse.json({
        today: formatStat(todayStat),
        yesterday: formatStat(yesterdayStat),
        last7Days,
        last30Days,
        totalAllTime,
        dailyChart,
        topChannelsAllTime,
        onlineNow,
        recentPageViews: recentPageViews.map((pv) => ({
          page: pv.page,
          channelId: pv.channelId,
          createdAt: pv.createdAt.toISOString(),
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
