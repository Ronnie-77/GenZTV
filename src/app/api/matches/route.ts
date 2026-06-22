import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { syncMatchStatusesAndNotify } from '@/lib/match-sync'
import { requireAdminAuth } from '@/lib/auth'

// GET /api/matches — list all matches (auto-syncs statuses based on time)
export async function GET(req: NextRequest) {
  try {
    // Auto-sync match statuses based on current time AND fire live
    // notifications for matches that just went live. Fire-and-forget so
    // the list response isn't blocked by notification sends.
    syncMatchStatusesAndNotify().catch((err) => {
      console.error('[Matches] Background status sync failed:', err)
    })

    const { searchParams } = new URL(req.url)
    const sport = searchParams.get('sport')
    const status = searchParams.get('status')
    const featured = searchParams.get('featured')

    const where: Record<string, unknown> = {}
    if (sport && sport !== 'all') where.sport = sport
    if (status && status !== 'all') where.status = status
    if (featured === 'true') where.isFeatured = true

    const matches = await db.match.findMany({
      where,
      include: { streams: true },
      orderBy: [
        { startTime: 'asc' },
      ],
    })

    // Sort by status priority: live → upcoming → ended
    const statusPriority: Record<string, number> = { live: 0, upcoming: 1, ended: 2 }
    matches.sort((a, b) => {
      const aPriority = statusPriority[a.status] ?? 9
      const bPriority = statusPriority[b.status] ?? 9
      if (aPriority !== bPriority) return aPriority - bPriority
      // Within same status, sort by startTime ascending
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    })

    return NextResponse.json(matches)
  } catch (error) {
    console.error('Error fetching matches:', error)
    return NextResponse.json({ error: 'Failed to fetch matches' }, { status: 500 })
  }
}

// POST /api/matches — create a new match (admin only)
//
// NOTE: Per the new product decision, creating a match does NOT send a push
// notification. Users are notified when the match goes LIVE (at the actual
// scheduled start time), not when it's merely scheduled.
export async function POST(req: NextRequest) {
  return requireAdminAuth(req, async () => {
  try {
    const body = await req.json()
    const match = await db.match.create({
      data: {
        title: body.title || `${body.teamA} vs ${body.teamB}`,
        sport: body.sport || 'football',
        teamA: body.teamA,
        teamALogo: body.teamALogo || '',
        teamB: body.teamB,
        teamBLogo: body.teamBLogo || '',
        league: body.league || '',
        thumbnail: body.thumbnail || '',
        startTime: new Date(body.startTime),
        endTime: body.endTime ? new Date(body.endTime) : null,
        status: body.status || 'upcoming',
        isFeatured: body.isFeatured || false,
        streams: {
          create: body.streams && body.streams.length > 0
            ? body.streams.map((s: { name?: string; channel?: string; type?: string; url?: string }) => ({
                name: s.name || 'Stream 1',
                channel: s.channel || '',
                type: s.type || 'iframe',
                url: s.url || '',
              }))
            : [{ name: 'Stream 1', channel: '', type: 'iframe', url: '' }],
        },
      },
      include: { streams: true },
    })

    // No push notification on match creation — users are notified when the
    // match goes LIVE (handled by syncMatchStatusesAndNotify above).

    return NextResponse.json(match, { status: 201 })
  } catch (error) {
    console.error('Error creating match:', error)
    return NextResponse.json({ error: 'Failed to create match' }, { status: 500 })
  }
  })
}
