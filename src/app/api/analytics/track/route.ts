import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createHash } from 'crypto'

// POST /api/analytics/track — track a page view
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

    // Generate session ID from fingerprint
    const sessionId = createHash('sha256')
      .update(`${ip}-${ua}`)
      .digest('hex')
      .slice(0, 16)

    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10) // YYYY-MM-DD

    // Update DailyStat — needs more sequential logic
    // First, check if this sessionId already has a pageview today (BEFORE creating the new one)
    const existingTodayView = await db.pageView.findFirst({
      where: {
        sessionId,
        createdAt: {
          gte: new Date(todayStr + 'T00:00:00.000Z'),
          lt: new Date(
            new Date(todayStr + 'T00:00:00.000Z').getTime() + 86400000
          ),
        },
      },
      select: { id: true },
    })

    // Upsert VisitorSession
    const visitorSessionPromise = db.visitorSession.upsert({
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
    const channelPromise = channelId
      ? db.channel.update({
          where: { id: channelId },
          data: { viewCount: { increment: 1 } },
        })
      : Promise.resolve(null)

    // Create PageView + update session + update channel in parallel
    await Promise.all([
      db.pageView.create({
        data: {
          sessionId,
          page,
          channelId: channelId || null,
          referrer: referrer || '',
          userAgent: ua,
          country,
          ip,
        },
      }),
      visitorSessionPromise,
      channelPromise,
    ])

    // We need the current DailyStat to update JSON fields
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

    // Parse current JSON fields
    const topPages: Record<string, number> = JSON.parse(
      currentStat.topPages || '{}'
    )
    const topChannels: Record<string, number> = JSON.parse(
      currentStat.topChannels || '{}'
    )
    const topCountries: Record<string, number> = JSON.parse(
      currentStat.topCountries || '{}'
    )

    // Update topPages
    topPages[page] = (topPages[page] || 0) + 1

    // Update topChannels if channelId provided
    if (channelId) {
      topChannels[channelId] = (topChannels[channelId] || 0) + 1
    }

    // Update topCountries
    if (country) {
      topCountries[country] = (topCountries[country] || 0) + 1
      // Keep only top 20
      const sortedCountries = Object.entries(topCountries)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20)
      // Rebuild topCountries with only top 20
      const filteredCountries: Record<string, number> = {}
      for (const [key, val] of sortedCountries) {
        filteredCountries[key] = val
      }
      Object.keys(topCountries).forEach((key) => {
        if (!(key in filteredCountries)) {
          delete topCountries[key]
        } else {
          topCountries[key] = filteredCountries[key]
        }
      })
    }

    // Build the update payload
    const updateData: Record<string, unknown> = {
      totalViews: { increment: 1 },
      topPages: JSON.stringify(topPages),
      topChannels: JSON.stringify(topChannels),
      topCountries: JSON.stringify(topCountries),
    }

    // If no existing view from this session today, increment uniqueVisitors
    if (!existingTodayView) {
      updateData.uniqueVisitors = { increment: 1 }
    }

    await db.dailyStat.update({
      where: { id: currentStat.id },
      data: updateData,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error tracking page view:', error)
    const message = error instanceof Error ? error.message : 'Failed to track page view'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
