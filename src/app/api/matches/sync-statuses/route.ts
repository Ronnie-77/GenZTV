import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/auth'
import { syncMatchStatusesAndNotify } from '@/lib/match-sync'

/**
 * POST /api/matches/sync-statuses — auto-update match statuses based on
 * start/end times AND fire LIVE notifications.
 *
 * This is the same logic that runs automatically (fire-and-forget) on every
 * GET /api/matches request. Exposing it as an explicit admin endpoint lets
 * the admin force a sync (e.g. from a cron job or a "Sync now" button)
 * without waiting for a user to load the matches list.
 *
 * The 30-minutes-early auto-live logic and the live notification logic are
 * both handled by the shared `syncMatchStatusesAndNotify` helper.
 */
export async function POST(req: NextRequest) {
  return requireAdminAuth(req, async () => {
    try {
      const result = await syncMatchStatusesAndNotify()
      return NextResponse.json({
        success: true,
        ...result,
        totalUpdated: result.updatedToLive + result.updatedToEnded,
      })
    } catch (error) {
      console.error('Error syncing match statuses:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      return NextResponse.json(
        { error: 'Failed to sync match statuses', detail: message },
        { status: 500 },
      )
    }
  })
}
