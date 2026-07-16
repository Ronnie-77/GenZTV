import { db } from '@/lib/db'

/**
 * Shared match-status sync helper.
 *
 * Extracted into its own module so it can be imported by both the
 * `/api/matches` route (auto-sync on GET) and the
 * `/api/matches/sync-statuses` route (explicit admin-triggered sync)
 * without creating a circular import between two route handlers.
 *
 * When matches flip from "upcoming" → "live", this function automatically
 * sends push notifications to all subscribed users (Google-style).
 */

/**
 * How many minutes BEFORE the scheduled start time a match should auto-flip
 * to "live" status.
 *
 * Set to 0 — matches go live at the ACTUAL scheduled start time, not early.
 */
export const LIVE_EARLY_MINUTES = 0

/**
 * Sync match statuses based on current time.
 * When matches go live, automatically send push notifications.
 *
 * @returns Counts of what was updated + notification results.
 */
export async function syncMatchStatuses(): Promise<{
  updatedToLive: number
  updatedToEnded: number
  notificationsSent: number
}> {
  const now = new Date()
  const liveThreshold = new Date(now.getTime() + LIVE_EARLY_MINUTES * 60 * 1000)

  // Find upcoming matches whose start time has arrived (or already passed).
  const startingMatches = await db.match.findMany({
    where: {
      status: 'upcoming',
      startTime: { lte: liveThreshold },
    },
    select: { id: true },
  })

  // Find live matches whose endTime has passed → set to ended.
  const endedMatches = await db.match.findMany({
    where: {
      status: 'live',
      endTime: { lte: now },
    },
    select: { id: true },
  })

  let updatedToLive = 0
  let updatedToEnded = 0
  let notificationsSent = 0

  // Update upcoming → live (only for matches that haven't ended yet)
  if (startingMatches.length > 0) {
    const result = await db.match.updateMany({
      where: {
        id: { in: startingMatches.map(m => m.id) },
        // Only flip to live if endTime hasn't passed (or endTime is null)
        OR: [
          { endTime: null },
          { endTime: { gt: now } },
        ],
      },
      data: { status: 'live' },
    })
    updatedToLive = result.count

    // 🔔 Send push notifications for matches that just went LIVE
    if (updatedToLive > 0) {
      try {
        // Fetch full match details for the matches that just went live
        const liveMatches = await db.match.findMany({
          where: {
            id: { in: startingMatches.map(m => m.id) },
            status: 'live', // only the ones that actually got updated
          },
          select: {
            id: true,
            title: true,
            sport: true,
            teamA: true,
            teamALogo: true,
            teamB: true,
            teamBLogo: true,
            league: true,
          },
        })

        // Dynamically import push sender to avoid circular deps at module level
        const { sendMatchLiveNotification } = await import('@/lib/push')

        // Send notification for each match that went live
        // Use Promise.allSettled so one failure doesn't block others
        const pushResults = await Promise.allSettled(
          liveMatches.map(match =>
            sendMatchLiveNotification({
              id: match.id,
              title: match.title,
              sport: match.sport,
              teamA: match.teamA,
              teamALogo: match.teamALogo,
              teamB: match.teamB,
              teamBLogo: match.teamBLogo,
              league: match.league,
            })
          )
        )

        // Count successful notifications
        for (const r of pushResults) {
          if (r.status === 'fulfilled' && r.value.sent > 0) {
            notificationsSent += r.value.sent
          }
        }

        if (liveMatches.length > 0) {
          console.log(
            `[MatchSync] ${updatedToLive} match(es) went LIVE → push notifications sent to ${notificationsSent} device(s)`
          )
        }
      } catch (pushError) {
        // Don't let push notification failures break the sync
        console.error('[MatchSync] Push notification error (non-fatal):', pushError)
      }
    }
  }

  // Update live → ended
  if (endedMatches.length > 0) {
    const result = await db.match.updateMany({
      where: { id: { in: endedMatches.map(m => m.id) } },
      data: { status: 'ended' },
    })
    updatedToEnded = result.count
  }

  return { updatedToLive, updatedToEnded, notificationsSent }
}
