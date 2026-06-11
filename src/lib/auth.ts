// ═══════════════════════════════════════════════════════════
// Server-side Admin Authentication
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'zeng-admin-session'
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000 // 24 hours in ms

// In-memory session store (resets on server restart — acceptable for single-admin)
const activeSessions = new Map<string, { createdAt: number }>()

/** Generate a cryptographically random session token */
function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Get the admin password from environment */
function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'Ronnie7700'
}

/** Validate password and create session — returns token or null */
export function authenticateAdmin(password: string): string | null {
  if (password !== getAdminPassword()) return null

  const token = generateToken()
  activeSessions.set(token, { createdAt: Date.now() })

  // Cleanup old sessions (older than 24h)
  const now = Date.now()
  for (const [key, value] of activeSessions) {
    if (now - value.createdAt > SESSION_MAX_AGE) {
      activeSessions.delete(key)
    }
  }

  return token
}

/** Verify a session token */
export function verifySession(token: string): boolean {
  const session = activeSessions.get(token)
  if (!session) return false
  // Check expiry
  if (Date.now() - session.createdAt > SESSION_MAX_AGE) {
    activeSessions.delete(token)
    return false
  }
  return true
}

/** Destroy a session */
export function destroySession(token: string): void {
  activeSessions.delete(token)
}

/** Get session token from request cookies */
export function getSessionToken(req: NextRequest): string | null {
  return req.cookies.get(COOKIE_NAME)?.value || null
}

/** Set session cookie on response */
export function setSessionCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60, // 24 hours in seconds
  })
  return response
}

/** Clear session cookie on response */
export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}

/** Check if request is from authenticated admin — returns true/false */
export async function isAdminAuthenticated(req: NextRequest): Promise<boolean> {
  const token = getSessionToken(req)
  if (!token) return false
  return verifySession(token)
}

/** Middleware helper: require admin auth for API routes */
export async function requireAdminAuth(
  req: NextRequest,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const authenticated = await isAdminAuthenticated(req)
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return handler()
}
