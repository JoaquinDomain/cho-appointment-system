// Admin login session saved in D1.
// Cookie has the token, D1 only keeps the hash.
import { createHash, randomBytes } from 'node:crypto'
import { d1First, d1Run } from '../db/d1'

export const SESSION_COOKIE = 'cho_admin_session'
export const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60 // 7 days
// Hard cap: sliding refresh can never keep a session alive past this.
export const SESSION_ABSOLUTE_MAX_AGE_SEC = 30 * 24 * 60 * 60 // 30 days
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

/** Delete every session for one email (used when the password is reseeded). */
export async function revokeSessionsForEmail(email: string): Promise<void> {
  await d1Run('DELETE FROM admin_sessions WHERE email = ?', [email]).catch(() => 0)
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

// Check session and extend expiry if almost expired.
// Sliding refresh never extends past the absolute lifetime.
export async function getSessionEmail(req: Request): Promise<string | null> {
  const token = getSessionToken(req)
  if (!token) return null
  const row = await d1First<{ email: string; expires_at: number; created_at: number }>(
    'SELECT email, expires_at, created_at FROM admin_sessions WHERE token_hash = ?',
    [hashToken(token)]
  ).catch(() => null)
  if (!row) return null
  const now = nowSec()
  const deadline = (row.created_at || 0) + SESSION_ABSOLUTE_MAX_AGE_SEC
  if (row.expires_at <= now || now >= deadline) {
    await d1Run('DELETE FROM admin_sessions WHERE token_hash = ?', [hashToken(token)]).catch(() => 0)
    return null
  }
  if (row.expires_at - now < REFRESH_THRESHOLD_SEC) {
    const nextExpiry = Math.min(now + SESSION_MAX_AGE_SEC, deadline)
    await d1Run('UPDATE admin_sessions SET expires_at = ? WHERE token_hash = ?', [
      nextExpiry,
      hashToken(token),
    ]).catch(() => 0)
  }
  return row.email
}

/**
 * Cheap session check for the proxy: validates the token against D1 with
 * no side effects (no sliding refresh). Fails closed on errors.
 */
export async function hasValidSession(req: Request): Promise<boolean> {
  const token = getSessionToken(req)
  if (!token) return false
  const now = nowSec()
  try {
    const row = await d1First<{ email: string }>(
      'SELECT email FROM admin_sessions WHERE token_hash = ? AND expires_at > ? AND created_at > ?',
      [hashToken(token), now, now - SESSION_ABSOLUTE_MAX_AGE_SEC]
    )
    return Boolean(row)
  } catch (e) {
    console.error('Proxy session check failed:', e)
    return false
  }
}

export async function destroySession(req: Request): Promise<void> {
  const token = getSessionToken(req)
  if (!token) return
  await d1Run('DELETE FROM admin_sessions WHERE token_hash = ?', [hashToken(token)]).catch(() => 0)
}

// Secure when running in production, and also whenever the request itself
// arrived over HTTPS (protects against a misconfigured NODE_ENV behind TLS).
function secureFlag(req?: Request): string {
  if (process.env.NODE_ENV === 'production') return '; Secure'
  if (req && req.headers.get('x-forwarded-proto') === 'https') return '; Secure'
  return ''
}

export function sessionCookieHeader(token: string, req?: Request): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly${secureFlag(req)}; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SEC}`
}

export function clearSessionCookieHeader(req?: Request): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly${secureFlag(req)}; SameSite=Lax; Max-Age=0`
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
