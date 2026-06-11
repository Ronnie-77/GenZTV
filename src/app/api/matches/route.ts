import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendNewMatchNotification } from '@/lib/push'
import { requireAdminAuth } from '@/lib/auth'

// GET /api/matches — list all matches
export async function GET(req: NextRequest) {
  try {
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
        { status: 'asc' }, // live first, then upcoming, then ended
        { startTime: 'asc' },
      ],
    })

    return NextResponse.json(matches)
  } catch (error) {
    console.error('Error fetching matches:', error)
    return NextResponse.json({ error: 'Failed to fetch matches' }, { status: 500 })
  }
}

// POST /api/matches — create a new match (admin only)
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

    // Send push notification to all subscribers about new match (fire and forget)
    sendNewMatchNotification({
      id: match.id,
      title: match.title,
      sport: match.sport,
      teamA: match.teamA,
      teamB: match.teamB,
      league: match.league,
    }).catch((err) => {
      console.error('Failed to send push notification for new match:', err)
    })

    return NextResponse.json(match, { status: 201 })
  } catch (error) {
    console.error('Error creating match:', error)
    return NextResponse.json({ error: 'Failed to create match' }, { status: 500 })
  }
  })
}
