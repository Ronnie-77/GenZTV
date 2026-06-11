import { NextRequest, NextResponse } from 'next/server'
import { getSessionToken, destroySession, clearSessionCookie } from '@/lib/auth'

// POST /api/auth/logout
export async function POST(req: NextRequest) {
  try {
    const token = getSessionToken(req)
    if (token) {
      destroySession(token)
    }

    const response = NextResponse.json({ success: true, message: 'Logged out successfully' })
    return clearSessionCookie(response)
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 })
  }
}
