import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminAuth } from '@/lib/auth'

// POST /api/matches/sync-statuses — auto-update match statuses based on start/end times
export async function POST(req: NextRequest) {
  return requireAdminAuth(req, async () => {
    try {
      const now = new Date()

      // Find upcoming matches whose startTime has passed → set to live
      const startedMatches = await db.match.findMany({
        where: {
          status: 'upcoming',
          startTime: { lte: now },
        },
        select: { id: true },
      })

      // Find live matches whose endTime has passed → set to ended
      const endedMatches = await db.match.findMany({
        where: {
          status: 'live',
          endTime: { lte: now },
        },
        select: { id: true },
      })

      let updatedToLive = 0
      let updatedToEnded = 0

      // Update upcoming → live
      if (startedMatches.length > 0) {
        const result = await db.match.updateMany({
          where: { id: { in: startedMatches.map(m => m.id) } },
          data: { status: 'live' },
        })
        updatedToLive = result.count
      }

      // Update live → ended
      if (endedMatches.length > 0) {
        const result = await db.match.updateMany({
          where: { id: { in: endedMatches.map(m => m.id) } },
          data: { status: 'ended' },
        })
        updatedToEnded = result.count
      }

      return NextResponse.json({
        success: true,
        updatedToLive,
        updatedToEnded,
        totalUpdated: updatedToLive + updatedToEnded,
      })
    } catch (error) {
      console.error('Error syncing match statuses:', error)
      return NextResponse.json({ error: 'Failed to sync match statuses' }, { status: 500 })
    }
  })
}
