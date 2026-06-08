import webpush from 'web-push'
import { db } from '@/lib/db'

// Configure web-push with VAPID details
if (process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY
  )
}

export interface PushSubscriptionData {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

/**
 * Send a push notification to ALL subscribed users
 */
export async function sendPushToAll(payload: {
  title: string
  body: string
  icon?: string
  url?: string
  tag?: string
}) {
  const subscriptions = await db.pushSubscription.findMany()

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 }
  }

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/logo.svg',
    url: payload.url || '/',
    tag: payload.tag || 'genztv-notification',
  })

  let sent = 0
  let failed = 0
  const invalidSubscriptions: string[] = []

  // Send to each subscription
  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        const pushSubscription: PushSubscriptionData = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        }
        await webpush.sendNotification(pushSubscription, notificationPayload)
        sent++
      } catch (error: unknown) {
        failed++
        // If subscription is invalid (410 Gone or 404), mark for deletion
        if (
          error instanceof Error &&
          'statusCode' in error &&
          ((error as { statusCode: number }).statusCode === 410 ||
           (error as { statusCode: number }).statusCode === 404)
        ) {
          invalidSubscriptions.push(sub.id)
        }
        console.error('Push send failed for', sub.endpoint, error)
      }
    })
  )

  // Clean up invalid subscriptions
  if (invalidSubscriptions.length > 0) {
    await db.pushSubscription.deleteMany({
      where: { id: { in: invalidSubscriptions } },
    })
  }

  return { sent, failed, removed: invalidSubscriptions.length }
}

/**
 * Send a push notification about a new match
 */
export async function sendNewMatchNotification(match: {
  title: string
  sport: string
  teamA: string
  teamB: string
  league?: string
  id: string
}) {
  const sportEmoji = match.sport === 'cricket' ? '🏏' : match.sport === 'football' ? '⚽' : '🏆'
  const leagueText = match.league ? ` | ${match.league}` : ''

  return sendPushToAll({
    title: `${sportEmoji} New Match Alert!`,
    body: `${match.teamA} vs ${match.teamB}${leagueText}`,
    url: `/#/watch`,
    tag: `match-${match.id}`,
  })
}

export { webpush }
