import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/push/subscribers — Get total subscriber count
export async function GET() {
  try {
    const count = await db.pushSubscription.count()
    return NextResponse.json({ count })
  } catch (error) {
    console.error('Error counting push subscriptions:', error)
    return NextResponse.json({ error: 'Failed to count subscribers' }, { status: 500 })
  }
}
