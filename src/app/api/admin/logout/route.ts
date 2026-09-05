import { NextResponse } from 'next/server'
import { destroySession, clearSessionCookieHeader } from '@/lib/session'

// POST /api/admin/logout — destroys the session, clears the cookie.
export async function POST(req: Request) {
  await destroySession(req)
  const res = NextResponse.json({ ok: true })
  res.headers.set('Set-Cookie', clearSessionCookieHeader())
  return res
}
