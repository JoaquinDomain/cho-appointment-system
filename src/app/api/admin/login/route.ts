import { NextResponse } from 'next/server'
import { d1First } from '@/lib/d1'
import { verifyPassword, verifyAgainstDummy } from '@/lib/password'
import { createSession, sessionCookieHeader } from '@/lib/session'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

// POST /api/admin/login — { email, password } → sets httpOnly session cookie.
// Generic error messages to avoid user enumeration; dummy verify on miss.
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
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
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
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }
  if (!verifyPassword(password, row.password_hash)) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }

  let token: string
  try {
    token = await createSession(row.email)
  } catch (e) {
    console.error('Session creation failed:', e)
    return NextResponse.json({ error: 'Login service unavailable.' }, { status: 503 })
  }

  const res = NextResponse.json({ ok: true, email: row.email })
  res.headers.set('Set-Cookie', sessionCookieHeader(token))
  return res
}
