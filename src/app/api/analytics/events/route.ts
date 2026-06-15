import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/analytics/events — track custom events, conversions, and user properties
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, eventName, goalName, params, userProps, page, channelId, matchId } = body as {
      type: 'event' | 'conversion' | 'user_properties'
      eventName?: string
      goalName?: string
      params?: Record<string, unknown>
      userProps?: Record<string, unknown>
      page?: string
      channelId?: string
      matchId?: string
    }

    if (!type) {
      return NextResponse.json({ error: 'Type is required' }, { status: 400 })
    }

    // Get request metadata (same logic as track route)
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      ''
    const ua = request.headers.get('user-agent') || ''
    const country = request.headers.get('x-vercel-ip-country') || ''

    // Generate session ID from ip+ua
    let hash = 0
    const str = `${ip}-${ua}`
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    const sessionId = Math.abs(hash).toString(36).padStart(8, '0')

    const todayStr = new Date().toISOString().slice(0, 10)

    if (type === 'event') {
      if (!eventName) {
        return NextResponse.json({ error: 'eventName is required for event type' }, { status: 400 })
      }

      // Create CustomEvent record
      await db.customEvent.create({
        data: {
          sessionId,
          eventName,
          params: JSON.stringify(params || {}),
          page: page || '',
          channelId: channelId || null,
          matchId: matchId || null,
          userAgent: ua,
          country,
          ip,
        },
      })

      // Update DailyStat's customEvents JSON field
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
          customEvents: '{}',
        },
      })

      const customEvents: Record<string, number> = JSON.parse(currentStat.customEvents || '{}')
      customEvents[eventName] = (customEvents[eventName] || 0) + 1

      await db.dailyStat.update({
        where: { id: currentStat.id },
        data: {
          customEvents: JSON.stringify(customEvents),
        },
      })
    } else if (type === 'conversion') {
      if (!goalName) {
        return NextResponse.json({ error: 'goalName is required for conversion type' }, { status: 400 })
      }

      // Create ConversionEvent record
      await db.conversionEvent.create({
        data: {
          sessionId,
          goalName,
          value: (params?.value as number) || 0,
          params: JSON.stringify(params || {}),
          userAgent: ua,
          country,
          ip,
        },
      })
    } else if (type === 'user_properties') {
      if (!userProps) {
        return NextResponse.json({ error: 'userProps is required for user_properties type' }, { status: 400 })
      }

      // Upsert VisitorSession with user properties
      const now = new Date()
      await db.visitorSession.upsert({
        where: { sessionId },
        update: {
          lastSeen: now,
          ...(userProps.deviceType !== undefined && { deviceType: String(userProps.deviceType) }),
          ...(userProps.connectionType !== undefined && { connectionType: String(userProps.connectionType) }),
          ...(userProps.appVersion !== undefined && { appVersion: String(userProps.appVersion) }),
          ...(userProps.notificationOptIn !== undefined && { notificationOptIn: Boolean(userProps.notificationOptIn) }),
        },
        create: {
          sessionId,
          firstSeen: now,
          lastSeen: now,
          pageCount: 0,
          country,
          userAgent: ua,
          ip,
          ...(userProps.deviceType !== undefined && { deviceType: String(userProps.deviceType) }),
          ...(userProps.connectionType !== undefined && { connectionType: String(userProps.connectionType) }),
          ...(userProps.appVersion !== undefined && { appVersion: String(userProps.appVersion) }),
          ...(userProps.notificationOptIn !== undefined && { notificationOptIn: Boolean(userProps.notificationOptIn) }),
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Analytics] Events error:', error)
    const message = error instanceof Error ? error.message : 'Failed to track event'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
