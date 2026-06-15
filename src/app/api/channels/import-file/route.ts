import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/auth'

interface ParsedChannel {
  name: string
  logo: string
  group: string
  url: string
  language?: string
  country?: string
}

// POST /api/channels/import-file — parse uploaded .m3u or .json file content
export async function POST(req: NextRequest) {
  return requireAdminAuth(req, async () => {
    try {
      const body = await req.json()
      const { content, fileType } = body as { content: string; fileType: string }

      if (!content || !fileType) {
        return NextResponse.json({ error: 'File content and type are required' }, { status: 400 })
      }

      let channels: ParsedChannel[] = []

      if (fileType === 'm3u') {
        channels = parseM3UContent(content)
      } else if (fileType === 'json') {
        channels = parseJSONContent(content)
      } else {
        return NextResponse.json({ error: 'Unsupported file type. Use .m3u or .json' }, { status: 400 })
      }

      return NextResponse.json({ channels, total: channels.length })
    } catch (error) {
      console.error('Error parsing import file:', error)
      return NextResponse.json({ error: 'Failed to parse file' }, { status: 500 })
    }
  })
}

function parseM3UContent(content: string): ParsedChannel[] {
  const channels: ParsedChannel[] = []
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)

  let currentName = ''
  let currentLogo = ''
  let currentGroup = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('#EXTINF:')) {
      const nameMatch = line.match(/,(.+)$/)
      currentName = nameMatch ? nameMatch[1].trim() : 'Unknown Channel'

      const logoMatch = line.match(/tvg-logo="([^"]*)"/)
      currentLogo = logoMatch ? logoMatch[1] : ''

      const groupMatch = line.match(/group-title="([^"]*)"/)
      currentGroup = groupMatch ? groupMatch[1] : ''

      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j]
        if (!nextLine.startsWith('#')) {
          channels.push({
            name: currentName,
            logo: currentLogo,
            group: currentGroup,
            url: nextLine,
          })
          break
        }
      }
    }
  }

  return channels
}

function parseJSONContent(content: string): ParsedChannel[] {
  const channels: ParsedChannel[] = []

  try {
    const parsed = JSON.parse(content)

    // Support various JSON formats
    let items: unknown[] = []

    if (Array.isArray(parsed)) {
      // Direct array of channel objects
      items = parsed
    } else if (parsed && typeof parsed === 'object') {
      // Object with channels array
      if (Array.isArray(parsed.channels)) {
        items = parsed.channels
      } else if (Array.isArray(parsed.data)) {
        items = parsed.data
      } else if (parsed.exportData && Array.isArray(parsed.exportData.channels)) {
        // GenZTV export format
        items = parsed.exportData.channels
      }
    }

    for (const item of items) {
      if (!item || typeof item !== 'object') continue

      const obj = item as Record<string, unknown>

      // Map common field names to our format
      const name = String(obj.name || obj.title || obj.channel_name || obj.channelName || 'Unknown Channel')
      const logo = String(obj.logo || obj.logo_url || obj.logoUrl || obj.image || obj.icon || obj.tvg_logo || '')
      const group = String(obj.group || obj.group_title || obj.groupTitle || obj.category || obj.categories || '')
      const url = String(obj.url || obj.stream_url || obj.streamUrl || obj.stream || obj.link || '')
      const language = String(obj.language || obj.lang || '')
      const country = String(obj.country || obj.region || '')

      // Handle category as array or string
      let normalizedGroup = group
      if (Array.isArray(obj.category) || Array.isArray(obj.categories)) {
        const cats = (Array.isArray(obj.category) ? obj.category : obj.categories) as string[]
        normalizedGroup = cats.join(',')
      }

      // Only include if we have at least a name and url
      if (name && name !== 'Unknown Channel' && url) {
        channels.push({
          name,
          logo,
          group: normalizedGroup,
          url,
          language: language && language !== 'undefined' ? language : undefined,
          country: country && country !== 'undefined' ? country : undefined,
        })
      } else if (name && name !== 'Unknown Channel') {
        // Channel without URL — still include for user to see
        channels.push({
          name,
          logo,
          group: normalizedGroup,
          url,
          language: language && language !== 'undefined' ? language : undefined,
          country: country && country !== 'undefined' ? country : undefined,
        })
      }
    }
  } catch {
    throw new Error('Invalid JSON format')
  }

  return channels
}
