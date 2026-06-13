import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminAuth } from '@/lib/auth'

// GET /api/analytics/dashboard — admin analytics dashboard data
export async function GET(request: NextRequest) {
  return requireAdminAuth(request, async () => {
    try {
      const now = new Date()
      const todayStr = now.toISOString().slice(0, 10)
      const yesterdayDate = new Date(now.getTime() - 86400000)
      const yesterdayStr = yesterdayDate.toISOString().slice(0, 10)
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
      const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000)

      // Fetch today's and yesterday's DailyStats in parallel
      const [todayStat, yesterdayStat] = await Promise.all([
        db.dailyStat.findUnique({ where: { date: todayStr } }),
        db.dailyStat.findUnique({ where: { date: yesterdayStr } }),
      ])

      // Fetch last 14 days of DailyStat for chart
      const fourteenDaysAgo = new Date(now.getTime() - 13 * 86400000)
      const dailyStats = await db.dailyStat.findMany({
        where: {
          date: { gte: fourteenDaysAgo.toISOString().slice(0, 10) },
        },
        orderBy: { date: 'asc' },
      })

      // Aggregate last 7 days and last 30 days
      const [last7DaysStats, last30DaysStats] = await Promise.all([
        db.dailyStat.findMany({
          where: { date: { gte: sevenDaysAgo.toISOString().slice(0, 10) } },
        }),
        db.dailyStat.findMany({
          where: { date: { gte: thirtyDaysAgo.toISOString().slice(0, 10) } },
        }),
      ])

      const last7Days = {
        views: last7DaysStats.reduce((sum, s) => sum + s.totalViews, 0),
        uniqueVisitors: last7DaysStats.reduce(
          (sum, s) => sum + s.uniqueVisitors,
          0
        ),
      }

      const last30Days = {
        views: last30DaysStats.reduce((sum, s) => sum + s.totalViews, 0),
        uniqueVisitors: last30DaysStats.reduce(
          (sum, s) => sum + s.uniqueVisitors,
          0
        ),
      }

      // Total all time
      const allTimeStats = await db.dailyStat.findMany()
      const totalAllTime = {
        views: allTimeStats.reduce((sum, s) => sum + s.totalViews, 0),
        uniqueVisitors: allTimeStats.reduce(
          (sum, s) => sum + s.uniqueVisitors,
          0
        ),
      }

      // Online now: sessions with lastSeen in last 5 minutes
      const onlineNow = await db.visitorSession.count({
        where: { lastSeen: { gte: fiveMinAgo } },
      })

      // Recent page views (last 20)
      const recentPageViews = await db.pageView.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        select: {
          page: true,
          channelId: true,
          createdAt: true,
        },
      })

      // Top channels all time — aggregate from all DailyStats' topChannels
      const channelCounts: Record<string, number> = {}
      for (const stat of allTimeStats) {
        try {
          const parsed: Record<string, number> = JSON.parse(
            stat.topChannels || '{}'
          )
          for (const [channelId, count] of Object.entries(parsed)) {
            channelCounts[channelId] =
              (channelCounts[channelId] || 0) + count
          }
        } catch {
          // skip invalid JSON
        }
      }

      // Get channel names for top channels
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

      // Format daily chart data
      const dailyChart = dailyStats.map((s) => ({
        date: s.date,
        views: s.totalViews,
        uniqueVisitors: s.uniqueVisitors,
      }))

      // Build response
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
      console.error('Error fetching analytics dashboard:', error)
      return NextResponse.json(
        { error: 'Failed to fetch analytics' },
        { status: 500 }
      )
    }
  })
}
