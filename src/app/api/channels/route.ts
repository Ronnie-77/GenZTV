import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminAuth } from '@/lib/auth'

// GET /api/channels — list all channels (with optional filters)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')
    const search = searchParams.get('search')
    const featured = searchParams.get('featured')
    const active = searchParams.get('active')

    const where: Record<string, unknown> = {}
    if (category && category !== 'all') where.category = category
    if (featured === 'true') where.isFeatured = true
    // By default only show active channels, unless includeInactive=true (for admin)
    if (active === 'all') {
      // Show all channels regardless of active status
    } else if (active !== 'false') {
      where.isActive = true
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { tags: { contains: search } },
        { language: { contains: search } },
        { country: { contains: search } },
      ]
    }

    const channels = await db.channel.findMany({
      where,
      orderBy: [
        { isFeatured: 'desc' },
        { viewCount: 'desc' },
        { name: 'asc' },
      ],
    })

    return NextResponse.json(channels)
  } catch (error) {
    console.error('Error fetching channels:', error)
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 })
  }
}

// POST /api/channels — create a new channel (admin only)
export async function POST(req: NextRequest) {
  return requireAdminAuth(req, async () => {
  try {
    const body = await req.json()
    const channel = await db.channel.create({
      data: {
        name: body.name,
        logo: body.logo || '',
        category: body.category || 'entertainment',
        streamType: body.streamType || 'm3u',
        streamUrl: body.streamUrl || '',
        githubM3uPath: body.githubM3uPath || '',
        language: body.language || '',
        country: body.country || '',
        tags: Array.isArray(body.tags) ? body.tags.join(',') : (body.tags || ''),
        isFeatured: body.isFeatured || false,
        isActive: body.isActive !== false,
      },
    })
    return NextResponse.json(channel, { status: 201 })
  } catch (error) {
    console.error('Error creating channel:', error)
    return NextResponse.json({ error: 'Failed to create channel' }, { status: 500 })
  }
  })
}
