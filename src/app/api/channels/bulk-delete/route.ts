import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminAuth } from '@/lib/auth'

// POST /api/channels/bulk-delete — delete multiple channels (admin only)
export async function POST(req: NextRequest) {
  return requireAdminAuth(req, async () => {
    try {
      const body = await req.json()
      const { ids } = body as { ids: string[] }

      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: 'No channel IDs provided' }, { status: 400 })
      }

      const result = await db.channel.deleteMany({
        where: {
          id: { in: ids },
        },
      })

      return NextResponse.json({
        success: true,
        deleted: result.count,
      })
    } catch (error) {
      console.error('Error bulk deleting channels:', error)
      return NextResponse.json({ error: 'Failed to delete channels' }, { status: 500 })
    }
  })
}
