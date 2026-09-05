// Server-only opaque admin sessions stored in D1.
// Cookie holds the raw token; D1 holds only its SHA-256 hash.
import { createHash, randomBytes } from 'node:crypto'
import { d1First, d1Run } from './d1'

export const SESSION_COOKIE = 'cho_admin_session'
export const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60 // 7 days
const REFRESH_THRESHOLD_SEC = 48 * 60 * 60 // refresh expiry when < 48h remain

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

export async function createSession(email: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const now = nowSec()
  await d1Run(
    'INSERT INTO admin_sessions (token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?)',
    [hashToken(token), email, now + SESSION_MAX_AGE_SEC, now]
  )
  return token
}

export function getSessionToken(req: Request): string | null {
  const header = req.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === SESSION_COOKIE) {
      const value = part.slice(idx + 1).trim()
      if (/^[0-9a-f]{64}$/.test(value)) return value
      return null
    }
  }
  return null
}

// Returns the session email, or null. Sliding-refreshes expiry when close to expiring.
export async function getSessionEmail(req: Request): Promise<string | null> {
  const token = getSessionToken(req)
  if (!token) return null
  const row = await d1First<{ email: string; expires_at: number }>(
    'SELECT email, expires_at FROM admin_sessions WHERE token_hash = ?',
    [hashToken(token)]
  ).catch(() => null)
  if (!row) return null
  const now = nowSec()
  if (row.expires_at <= now) {
    await d1Run('DELETE FROM admin_sessions WHERE token_hash = ?', [hashToken(token)]).catch(() => 0)
    return null
  }
  if (row.expires_at - now < REFRESH_THRESHOLD_SEC) {
    await d1Run('UPDATE admin_sessions SET expires_at = ? WHERE token_hash = ?', [
      now + SESSION_MAX_AGE_SEC,
      hashToken(token),
    ]).catch(() => 0)
  }
  return row.email
}

export async function destroySession(req: Request): Promise<void> {
  const token = getSessionToken(req)
  if (!token) return
  await d1Run('DELETE FROM admin_sessions WHERE token_hash = ?', [hashToken(token)]).catch(() => 0)
}

export function sessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SEC}`
}

export function clearSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE}=; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=0`
}

export async function requireAdmin(
  req: Request
): Promise<{ email: string } | { error: string; status: number }> {
  let email: string | null
  try {
    email = await getSessionEmail(req)
  } catch (e) {
    console.error('Session check failed:', e)
    return { error: 'Admin service unavailable.', status: 503 }
  }
  if (!email) return { error: 'Unauthorized. Admin access required.', status: 401 }
  return { email }
}
