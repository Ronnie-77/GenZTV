import { NextRequest, NextResponse } from 'next/server'
import { sendPushToAll, sendNewMatchNotification } from '@/lib/push'

// POST /api/push/notify — Send push notification to all subscribers
// Used internally by admin when creating matches
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, match, title, body: notifBody, url, tag } = body

    let result

    if (type === 'new-match' && match) {
      // Send match-specific notification
      result = await sendNewMatchNotification(match)
    } else if (title && notifBody) {
      // Send custom notification
      result = await sendPushToAll({
        title,
        body: notifBody,
        url,
        tag,
      })
    } else {
      return NextResponse.json({ error: 'Invalid notification payload' }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error sending push notification:', error)
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }
}
