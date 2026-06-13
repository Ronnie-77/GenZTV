// ═══════════════════════════════════════════════════════════
// Server-side Admin Authentication
// Uses HMAC-signed cookies — survives server restarts
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

const COOKIE_NAME = 'zeng-admin-session'
const SESSION_MAX_AGE = 24 * 60 * 60 // 24 hours in seconds

/** Get the admin password from environment */
function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'Ronnie7700'
}

/** Get signing secret — derived from admin password for simplicity */
function getSigningSecret(): string {
  return `zeng-secret-${getAdminPassword()}`
}

/** Create a signed session token (timestamp + HMAC signature) */
function createSignedToken(): string {
  const timestamp = Math.floor(Date.now() / 1000).toString(36)
  const hmac = createHmac('sha256', getSigningSecret())
  hmac.update(timestamp)
  const signature = hmac.digest('hex').substring(0, 32)
  return `${timestamp}.${signature}`
}

/** Verify a signed session token */
function verifySignedToken(token: string): boolean {
  try {
    const parts = token.split('.')
    if (parts.length !== 2) return false

    const [timestampB36, signature] = parts
    const timestamp = parseInt(timestampB36, 36)

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000)
    if (now - timestamp > SESSION_MAX_AGE) return false

    // Verify HMAC signature
    const hmac = createHmac('sha256', getSigningSecret())
    hmac.update(timestampB36)
    const expectedSignature = hmac.digest('hex').substring(0, 32)

    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expectedSignature.length) return false
    let diff = 0
    for (let i = 0; i < signature.length; i++) {
      diff |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i)
    }
    return diff === 0
  } catch {
    return false
  }
}

/** Validate password and create session — returns token or null */
export function authenticateAdmin(password: string): string | null {
  if (password !== getAdminPassword()) return null
  return createSignedToken()
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
    maxAge: SESSION_MAX_AGE,
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
  return verifySignedToken(token)
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
