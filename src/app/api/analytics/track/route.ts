import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/analytics/track — track a page view
// Simplified to reduce memory usage and avoid server crashes
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { page, channelId, referrer } = body as {
      page: string
      channelId?: string
      referrer?: string
    }

    if (!page) {
      return NextResponse.json({ error: 'Page is required' }, { status: 400 })
    }

    // Get request metadata
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      ''
    const ua = request.headers.get('user-agent') || ''
    const country = request.headers.get('x-vercel-ip-country') || ''

    // Generate simple session ID from ip+ua (avoid crypto import to save memory)
    // Use a simple string hash instead of createHash
    let hash = 0
    const str = `${ip}-${ua}`
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    const sessionId = Math.abs(hash).toString(36).padStart(8, '0')

    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10) // YYYY-MM-DD

    // Create PageView
    await db.pageView.create({
      data: {
        sessionId,
        page,
        channelId: channelId || null,
        referrer: referrer || '',
        userAgent: ua,
        country,
        ip,
      },
    })

    // Upsert VisitorSession (sequential to avoid memory spikes)
    await db.visitorSession.upsert({
      where: { sessionId },
      update: {
        lastSeen: now,
        pageCount: { increment: 1 },
      },
      create: {
        sessionId,
        firstSeen: now,
        lastSeen: now,
        pageCount: 1,
        country,
        userAgent: ua,
        ip,
      },
    })

    // If channelId is provided, increment channel viewCount
    if (channelId) {
      await db.channel.update({
        where: { id: channelId },
        data: { viewCount: { increment: 1 } },
      }).catch(() => {
        // Channel might not exist — ignore error
      })
    }

    // Upsert DailyStat
    const currentStat = await db.dailyStat.upsert({
      where: { date: todayStr },
      update: {},
      create: {
        date: todayStr,
        totalViews: 0,
        uniqueVisitors: 0,
        topPages: '{}',
        topChannels: '{}',
        topCountries: '{}',
      },
    })

    // Check if this session already viewed today (for unique visitor count)
    const existingTodayView = await db.pageView.findFirst({
      where: {
        sessionId,
        createdAt: {
          gte: new Date(todayStr + 'T00:00:00.000Z'),
        },
      },
      select: { id: true },
    })

    // Parse and update JSON fields
    const topPages: Record<string, number> = JSON.parse(currentStat.topPages || '{}')
    const topChannels: Record<string, number> = JSON.parse(currentStat.topChannels || '{}')
    const topCountries: Record<string, number> = JSON.parse(currentStat.topCountries || '{}')

    topPages[page] = (topPages[page] || 0) + 1

    if (channelId) {
      topChannels[channelId] = (topChannels[channelId] || 0) + 1
    }

    if (country) {
      topCountries[country] = (topCountries[country] || 0) + 1
    }

    // Build update payload
    const updateData: Record<string, unknown> = {
      totalViews: { increment: 1 },
      topPages: JSON.stringify(topPages),
      topChannels: JSON.stringify(topChannels),
      topCountries: JSON.stringify(topCountries),
    }

    if (!existingTodayView) {
      updateData.uniqueVisitors = { increment: 1 }
    }

    await db.dailyStat.update({
      where: { id: currentStat.id },
      data: updateData,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Analytics] Track error:', error)
    const message = error instanceof Error ? error.message : 'Failed to track page view'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
