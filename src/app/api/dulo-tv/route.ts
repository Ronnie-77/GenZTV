import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const DULO_API = 'https://dulo.tv/api/live-tv/channels'

// Category mapping from dulo.tv to our categories
const categoryMap: Record<string, string> = {
  sports: 'sports',
  entertainment: 'entertainment',
  news: 'news',
  movies: 'movies',
  documentary: 'documentary',
  kids: 'kids',
}

interface DuloChannel {
  id: string
  name: string
  category: string
  source_url: string
  logo_url: string | null
  direct_source: boolean
  sort_order: number
  epg_source_url: string | null
  created_at: string
  updated_at: string
}

// Helper: fetch with timeout
async function fetchWithTimeout(url: string, timeoutMs: number = 10000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://dulo.tv/live',
      },
    })
    return response
  } finally {
    clearTimeout(timer)
  }
}

// GET /api/dulo-tv — fetch sync status or dulo data
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')

    if (action === 'status') {
      return await getSyncStatus()
    }

    // Default: return sync status (avoid fetching from dulo.tv API as it may be blocked)
    return await getSyncStatus()
  } catch (error) {
    console.error('Error in dulo-tv GET:', error)
    return NextResponse.json({ error: 'Failed to process dulo.tv request' }, { status: 500 })
  }
}

// POST /api/dulo-tv — sync (import/update) dulo.tv channels into our DB
export async function POST(req: NextRequest) {
  try {
    return await syncChannels()
  } catch (error) {
    console.error('Error syncing dulo.tv channels:', error)
    return NextResponse.json({ error: 'Failed to sync dulo.tv channels' }, { status: 500 })
  }
}

async function syncChannels() {
  // Fetch from dulo.tv API with timeout protection
  let response: Response
  try {
    response = await fetchWithTimeout(DULO_API, 15000)
  } catch {
    return NextResponse.json({
      success: false,
      error: 'Could not connect to dulo.tv API. The server may be blocking requests. Try again later.',
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      deactivated: 0,
    }, { status: 502 })
  }

  if (!response.ok) {
    return NextResponse.json({
      success: false,
      error: `Dulo API returned ${response.status}. Cloudflare may be blocking server-side requests.`,
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      deactivated: 0,
    }, { status: 502 })
  }

  const data = await response.json()
  const duloChannels: DuloChannel[] = data.channels || []

  // Get existing dulo channels from our DB
  const existingDuloChannels = await db.channel.findMany({
    where: { source: 'dulo' },
  })

  const existingBySourceId = new Map(existingDuloChannels.map(ch => [ch.sourceId, ch]))

  let created = 0
  let updated = 0
  let skipped = 0
  let deactivated = 0

  // Process each dulo.tv channel
  const duloSourceIds = new Set(duloChannels.map(ch => ch.id))

  for (const duloCh of duloChannels) {
    // Parse name: "Channel Name | Country"
    const nameParts = duloCh.name.split(' | ')
    const channelName = nameParts[0].trim()
    const country = nameParts.length > 1 ? nameParts[1].trim() : ''
    const category = categoryMap[duloCh.category] || 'entertainment'

    // Extract country code from name for tags
    const tags = [duloCh.category, country.toLowerCase()].filter(Boolean).join(',')

    const existing = existingBySourceId.get(duloCh.id)

    if (existing) {
      // Update existing channel if stream URL changed
      if (existing.streamUrl !== duloCh.source_url || existing.name !== channelName || existing.logo !== (duloCh.logo_url || '')) {
        await db.channel.update({
          where: { id: existing.id },
          data: {
            name: channelName,
            logo: duloCh.logo_url || existing.logo,
            category,
            streamUrl: duloCh.source_url,
            country,
            tags,
            isActive: true,
          },
        })
        updated++
      } else {
        skipped++
      }
    } else {
      // Create new channel
      await db.channel.create({
        data: {
          name: channelName,
          logo: duloCh.logo_url || '',
          category,
          streamType: 'm3u',
          streamUrl: duloCh.source_url,
          country,
          language: 'English',
          tags,
          source: 'dulo',
          sourceId: duloCh.id,
          isFeatured: false,
          isActive: true,
        },
      })
      created++
    }
  }

  // Deactivate channels that no longer exist in dulo.tv
  for (const existing of existingDuloChannels) {
    if (!duloSourceIds.has(existing.sourceId)) {
      await db.channel.update({
        where: { id: existing.id },
        data: { isActive: false },
      })
      deactivated++
    }
  }

  return NextResponse.json({
    success: true,
    total: duloChannels.length,
    created,
    updated,
    skipped,
    deactivated,
  })
}

async function getSyncStatus() {
  const duloChannelCount = await db.channel.count({
    where: { source: 'dulo', isActive: true },
  })

  const lastUpdated = await db.channel.findFirst({
    where: { source: 'dulo' },
    orderBy: { updatedAt: 'desc' },
    select: { updatedAt: true },
  })

  return NextResponse.json({
    count: duloChannelCount,
    lastUpdated: lastUpdated?.updatedAt || null,
  })
}

// DELETE /api/dulo-tv — remove all dulo channels
export async function DELETE() {
  try {
    const result = await db.channel.deleteMany({
      where: { source: 'dulo' },
    })
    return NextResponse.json({ success: true, deleted: result.count })
  } catch (error) {
    console.error('Error deleting dulo.tv channels:', error)
    return NextResponse.json({ error: 'Failed to delete dulo.tv channels' }, { status: 500 })
  }
}
