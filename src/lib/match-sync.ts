import { db } from '@/lib/db'
import { sendMatchLiveNotification } from '@/lib/push'

/**
 * Shared match-status sync helper.
 *
 * Extracted into its own module so it can be imported by both the
 * `/api/matches` route (auto-sync on GET) and the
 * `/api/matches/sync-statuses` route (explicit admin-triggered sync)
 * without creating a circular import between two route handlers.
 */

/**
 * How many minutes BEFORE the scheduled start time a match should auto-flip
 * to "live" status.
 *
 * Set to 0 — matches go live at the ACTUAL scheduled start time, not early.
 * The live push notification also fires at the real start time. This matches
 * the product decision: users are notified when the match actually starts.
 */
export const LIVE_EARLY_MINUTES = 0

/**
 * Synchronously sync match statuses AND fire live notifications for matches
 * that just transitioned upcoming → live. Safe to call on every matches
 * list request — the `liveNotifiedAt` field guarantees each match only
 * notifies once.
 *
 * @returns Counts of what was updated/notified.
 */
export async function syncMatchStatusesAndNotify(): Promise<{
  updatedToLive: number
  updatedToEnded: number
  notified: number
}> {
  const now = new Date()
  const liveThreshold = new Date(now.getTime() + LIVE_EARLY_MINUTES * 60 * 1000)

  // Find upcoming matches whose start time has arrived (or already passed).
  // With LIVE_EARLY_MINUTES = 0, this means startTime <= now — i.e. the
  // match has actually started.
  const startingMatches = await db.match.findMany({
    where: {
      status: 'upcoming',
      startTime: { lte: liveThreshold },
    },
    select: {
      id: true, title: true, sport: true,
      teamA: true, teamALogo: true,
      teamB: true, teamBLogo: true,
      league: true, startTime: true,
    },
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
  let notified = 0

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

    // Send "LIVE NOW" push notifications for matches that just went live.
    // We check liveNotifiedAt to avoid duplicate notifications — the first
    // request that flips the status will set liveNotifiedAt, and subsequent
    // requests will skip the notification.
    for (const match of startingMatches) {
      // Re-read the match to check if liveNotifiedAt is set (race-safe).
      const fresh = await db.match.findUnique({
        where: { id: match.id },
        select: { liveNotifiedAt: true, status: true },
      })
      // Only notify if the match is now live AND we haven't notified yet.
      if (fresh && fresh.status === 'live' && !fresh.liveNotifiedAt) {
        // Atomically claim the notification slot (set liveNotifiedAt only if null).
        // This prevents duplicate notifications when multiple users hit /api/matches
        // simultaneously and trigger the sync.
        const claim = await db.match.updateMany({
          where: { id: match.id, liveNotifiedAt: null },
          data: { liveNotifiedAt: now },
        })
        if (claim.count > 0) {
          // We successfully claimed the notification — fire it.
          notified++
          sendMatchLiveNotification({
            id: match.id,
            title: match.title,
            sport: match.sport,
            teamA: match.teamA,
            teamALogo: match.teamALogo,
            teamB: match.teamB,
            teamBLogo: match.teamBLogo,
            league: match.league,
          }).catch((err) => {
            console.error(`[MatchSync] Failed to send LIVE notification for match ${match.id}:`, err)
          })
        }
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

  return { updatedToLive, updatedToEnded, notified }
}
