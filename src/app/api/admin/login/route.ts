import { NextResponse } from 'next/server'
import { d1First } from '@/lib/db/d1'
import { verifyPassword, verifyAgainstDummy } from '@/lib/auth/password'
import { createSession, sessionCookieHeader } from '@/lib/auth/session'
import {
  checkRateLimit,
  peekRateLimit,
  recordRateLimit,
  getClientIp,
} from '@/lib/security/rate-limit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_PASSWORD_LEN = 1024
const ACCOUNT_FAIL_LIMIT = 5
const ACCOUNT_FAIL_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

const invalidCredentials = () =>
  NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })

// POST login, sets session cookie on success.
// Same error message either way so emails cannot be guessed.
// Two rate limits: per-IP (every attempt) and per-account (failures only,
// so a distributed attacker still cannot brute-force one email).
export async function POST(req: Request) {
  const ip = getClientIp(req)
  const rl = checkRateLimit(`login:${ip}`, 10, 10 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    )
  }

  let body: { email?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return invalidCredentials()
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (
    !email ||
    email.length > 254 ||
    !EMAIL_RE.test(email) ||
    password.length === 0 ||
    password.length > MAX_PASSWORD_LEN
  ) {
    return invalidCredentials()
  }

  const failKey = `login-fail:${email}`
  const accountLimit = peekRateLimit(failKey, ACCOUNT_FAIL_LIMIT, ACCOUNT_FAIL_WINDOW_MS)
  if (!accountLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(accountLimit.retryAfterSec) } }
    )
  }

  let row: { email: string; password_hash: string } | null = null
  try {
    row = await d1First<{ email: string; password_hash: string }>(
      'SELECT email, password_hash FROM admin_users WHERE email = ?',
      [email]
    )
  } catch (e) {
    console.error('Login lookup failed:', e)
    return NextResponse.json({ error: 'Login service unavailable.' }, { status: 503 })
  }

  if (!row) {
    verifyAgainstDummy(password)
    recordRateLimit(failKey, ACCOUNT_FAIL_WINDOW_MS)
    return invalidCredentials()
  }
  if (!verifyPassword(password, row.password_hash)) {
    recordRateLimit(failKey, ACCOUNT_FAIL_WINDOW_MS)
    return invalidCredentials()
  }

  let token: string
  try {
    token = await createSession(row.email)
  } catch (e) {
    console.error('Session creation failed:', e)
    return NextResponse.json({ error: 'Login service unavailable.' }, { status: 503 })
  }

  const res = NextResponse.json({ ok: true, email: row.email })
  res.headers.set('Set-Cookie', sessionCookieHeader(token, req))
  return res
}
