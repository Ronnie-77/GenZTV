import webpush from 'web-push'
import { db } from '@/lib/db'
import { getVapidConfig, isVapidConfigured } from '@/lib/vapid'

// Configure web-push with VAPID details
const vapidConfig = getVapidConfig()
if (vapidConfig.publicKey && vapidConfig.privateKey && vapidConfig.subject) {
  webpush.setVapidDetails(
    vapidConfig.subject,
    vapidConfig.publicKey,
    vapidConfig.privateKey
  )
}

// Optional: configure GCM/FCM server key for legacy endpoints
if (process.env.FCM_SERVER_KEY) {
  webpush.setGCMAPIKey(process.env.FCM_SERVER_KEY)
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  icon?: string
}

/**
 * Send a push notification to ALL subscribed devices.
 * Returns count of successful and failed sends.
 */
export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; failed: number }> {
  // Guard: if VAPID is not configured, skip silently to avoid 401 errors
  if (!isVapidConfigured()) {
    return { sent: 0, failed: 0 }
  }

  const subscriptions = await db.pushSubscription.findMany()

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 }
  }

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || '/',
    icon: payload.icon || '/logo.svg',
  })

  let sent = 0
  let failed = 0

  // Send push in batches of 10 to avoid overwhelming the server
  const BATCH_SIZE = 10
  for (let i = 0; i < subscriptions.length; i += BATCH_SIZE) {
    const batch = subscriptions.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            pushPayload,
            {
              TTL: 86400, // 24 hours
            }
          )
          return true
        } catch (error: unknown) {
          // If subscription is expired/gone (410), remove it from DB
          if (error instanceof Error && 'statusCode' in error) {
            const statusCode = (error as { statusCode: number }).statusCode
            if (statusCode === 410 || statusCode === 404) {
              await db.pushSubscription.deleteMany({
                where: { id: sub.id },
              }).catch(() => {})
            }
          }
          throw error
        }
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        sent++
      } else {
        failed++
      }
    }
  }

  return { sent, failed }
}

/**
 * Send a push notification to a single subscription.
 */
export async function sendPushToSubscription(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<boolean> {
  if (!isVapidConfigured()) {
    return false
  }

  try {
    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/',
      icon: payload.icon || '/logo.svg',
    })

    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      pushPayload,
      {
        TTL: 86400,
      }
    )
    return true
  } catch {
    return false
  }
}
