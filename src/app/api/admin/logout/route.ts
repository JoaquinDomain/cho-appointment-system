import { NextResponse } from 'next/server'
import { destroySession, clearSessionCookieHeader } from '@/lib/auth/session'

// logout, delete session and clear cookie
export async function POST(req: Request) {
  await destroySession(req)
  const res = NextResponse.json({ ok: true })
  res.headers.set('Set-Cookie', clearSessionCookieHeader())
  return res
}
