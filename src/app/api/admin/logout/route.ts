import { NextResponse } from 'next/server'
import { destroySession, clearSessionCookieHeader } from '@/lib/auth/session'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'

// logout, delete session and clear cookie
export async function POST(req: Request) {
  const ip = getClientIp(req)
  const rl = checkRateLimit(`logout:${ip}`, 30, 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }
  await destroySession(req)
  const res = NextResponse.json({ ok: true })
  res.headers.set('Set-Cookie', clearSessionCookieHeader(req))
  return res
}
