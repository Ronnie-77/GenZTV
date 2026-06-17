import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseUserAgent } from '@/lib/ua-parser'
import { lookupCountry, countryFromHeaders } from '@/lib/geo'

// POST /api/analytics/track — track a page view
// Records REAL visitor data only: IP, User-Agent → device + browser,
// IP → country (via ip-api.com), page, channel, referrer.
// Also maintains DailyStat.peakVisitors = max concurrent online (5-min window)
// seen so far today.
//
// DEFENSIVE DESIGN:
// The Task-17 schema added `device`, `browser`, `country` (PageView/VisitorSession)
// and `peakVisitors`, `topDevices`, `topBrowsers` (DailyStat). If a developer's
// LOCAL machine hasn't run `bun run db:push` yet, the local Prisma client /
// SQLite DB won't know these fields and every write that includes them would
// throw "Unknown field `device` ..." and return 500 — breaking ALL tracking.
// To avoid that, every write below is attempted with the full (rich) payload
// first, and on a schema-mismatch error we retry with a minimal payload that
// only contains the original (pre-Task-17) fields. This way tracking NEVER
// breaks, even on an unmigrated local DB.

function isSchemaMismatchError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    msg.includes('Unknown field') ||
    msg.includes('does not exist') ||
    msg.includes('unknown column') ||
    msg.includes('no such column')
  )
}

// Fields introduced in Task-17. Stripped from the payload on the fallback path.
const NEW_FIELDS = ['device', 'browser', 'country', 'peakVisitors', 'topDevices', 'topBrowsers']

function stripNewFields<T extends Record<string, unknown>>(data: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (!NEW_FIELDS.includes(k)) out[k] = v
  }
  return out as Partial<T>
}

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

    // Parse device + browser from the REAL user-agent (no fake data).
    const { device, browser } = parseUserAgent(ua)

    // Country: prefer CDN/proxy headers, fall back to IP geolocation.
    // This is the REAL visitor country derived from their IP address.
    let country = countryFromHeaders(request.headers)
    if (!country && ip) {
      country = await lookupCountry(ip)
    }

    // Generate simple session ID from ip+ua (avoid crypto import to save memory)
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
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000)

    // Check if this session already viewed today (BEFORE creating the page view)
    const existingTodayView = await db.pageView.findFirst({
      where: {
        sessionId,
        createdAt: {
          gte: new Date(todayStr + 'T00:00:00.000Z'),
        },
      },
      select: { id: true },
    })

    // Create PageView (with REAL device + browser).
    // Fallback: if the local DB schema is pre-Task-17, retry without new fields.
    const pageViewData: Record<string, unknown> = {
      sessionId,
      page,
      channelId: channelId || null,
      referrer: referrer || '',
      userAgent: ua,
      country,
      ip,
      device,
      browser,
    }
    try {
      await db.pageView.create({ data: pageViewData as never })
    } catch (err) {
      if (isSchemaMismatchError(err)) {
        await db.pageView.create({ data: stripNewFields(pageViewData) as never })
      } else {
        throw err
      }
    }

    // Upsert VisitorSession (sequential to avoid memory spikes).
    // Fallback: strip country/device/browser on schema mismatch.
    const sessionUpdate = {
      lastSeen: now,
      pageCount: { increment: 1 },
      country: country || undefined,
      device: device || undefined,
      browser: browser || undefined,
    }
    const sessionCreate = {
      sessionId,
      firstSeen: now,
      lastSeen: now,
      pageCount: 1,
      country,
      userAgent: ua,
      ip,
      device,
      browser,
    }
    try {
      await db.visitorSession.upsert({
        where: { sessionId },
        update: sessionUpdate as never,
        create: sessionCreate as never,
      })
    } catch (err) {
      if (isSchemaMismatchError(err)) {
        await db.visitorSession.upsert({
          where: { sessionId },
          update: stripNewFields(sessionUpdate as Record<string, unknown>) as never,
          create: stripNewFields(sessionCreate as Record<string, unknown>) as never,
        })
      } else {
        throw err
      }
    }

    // If channelId is provided, increment channel viewCount
    if (channelId) {
      await db.channel.update({
        where: { id: channelId },
        data: { viewCount: { increment: 1 } },
      }).catch(() => {
        // Channel might not exist — ignore error
      })
    }

    // Upsert DailyStat.
    // Fallback: the Task-17 schema added peakVisitors/topDevices/topBrowsers to
    // DailyStat. On an old DB the `create` block referencing them throws, so we
    // retry with a minimal create block.
    const statCreate: Record<string, unknown> = {
      date: todayStr,
      totalViews: 0,
      uniqueVisitors: 0,
      peakVisitors: 0,
      topPages: '{}',
      topChannels: '{}',
      topCountries: '{}',
      topDevices: '{}',
      topBrowsers: '{}',
    }
    let currentStat
    try {
      currentStat = await db.dailyStat.upsert({
        where: { date: todayStr },
        update: {},
        create: statCreate as never,
      })
    } catch (err) {
      if (isSchemaMismatchError(err)) {
        currentStat = await db.dailyStat.upsert({
          where: { date: todayStr },
          update: {},
          create: stripNewFields(statCreate) as never,
        })
      } else {
        throw err
      }
    }

    // Parse and update JSON fields.
    // Defensive reads: topDevices/topBrowsers/topCountries may be absent on an
    // unmigrated DB (the column simply won't exist in the returned row).
    const pv = currentStat as Record<string, unknown>
    const topPages: Record<string, number> = JSON.parse((pv.topPages as string) || '{}')
    const topChannels: Record<string, number> = JSON.parse((pv.topChannels as string) || '{}')
    const topCountries: Record<string, number> = JSON.parse((pv.topCountries as string) || '{}')
    let topDevices: Record<string, number> = {}
    let topBrowsers: Record<string, number> = {}
    try {
      topDevices = JSON.parse((pv.topDevices as string) || '{}')
    } catch { /* column absent on old schema */ }
    try {
      topBrowsers = JSON.parse((pv.topBrowsers as string) || '{}')
    } catch { /* column absent on old schema */ }

    topPages[page] = (topPages[page] || 0) + 1

    if (channelId) {
      topChannels[channelId] = (topChannels[channelId] || 0) + 1
    }

    if (country) {
      topCountries[country] = (topCountries[country] || 0) + 1
    }

    if (device) {
      topDevices[device] = (topDevices[device] || 0) + 1
    }

    if (browser) {
      topBrowsers[browser] = (topBrowsers[browser] || 0) + 1
    }

    // Build update payload.
    // Includes the new JSON columns (topDevices/topBrowsers). If the local DB
    // doesn't have them, the update below will throw → we retry with a
    // stripped payload.
    const updateData: Record<string, unknown> = {
      totalViews: { increment: 1 },
      topPages: JSON.stringify(topPages),
      topChannels: JSON.stringify(topChannels),
      topCountries: JSON.stringify(topCountries),
      topDevices: JSON.stringify(topDevices),
      topBrowsers: JSON.stringify(topBrowsers),
    }

    if (!existingTodayView) {
      updateData.uniqueVisitors = { increment: 1 }
    }

    try {
      await db.dailyStat.update({
        where: { id: currentStat.id },
        data: updateData as never,
      })
    } catch (err) {
      if (isSchemaMismatchError(err)) {
        await db.dailyStat.update({
          where: { id: currentStat.id },
          data: stripNewFields(updateData) as never,
        })
      } else {
        throw err
      }
    }

    // Update peakVisitors = max concurrent online (5-min window) seen today.
    // This is a REAL metric: the highest number of simultaneously-active
    // visitors recorded so far today. Computed AFTER this session is recorded
    // so the current visitor is included in the count.
    // Wrapped in try/catch: peakVisitors column may be absent on an old DB,
    // and this is non-critical (must not fail the track request).
    try {
      const onlineNow = await db.visitorSession.count({
        where: { lastSeen: { gte: fiveMinAgo } },
      })
      const storedPeak = (pv.peakVisitors as number) || 0
      if (onlineNow > storedPeak) {
        try {
          await db.dailyStat.update({
            where: { id: currentStat.id },
            data: { peakVisitors: onlineNow },
          })
        } catch {
          // peakVisitors column absent on old schema — skip silently
        }
      }
    } catch {
      // Non-critical — don't fail the track request
    }

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
