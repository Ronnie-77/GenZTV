import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin, setSessionCookie } from '@/lib/auth'

// POST /api/auth/login
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { password } = body

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 })
    }

    const token = authenticateAdmin(password)
    if (!token) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
    }

    const response = NextResponse.json({ success: true, message: 'Logged in successfully' })
    return setSessionCookie(response, token)
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
