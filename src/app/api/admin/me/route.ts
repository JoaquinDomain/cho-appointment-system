import { NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/auth/session'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'

// check who is logged in
export async function GET(req: Request) {
  const ip = getClientIp(req)
  const rl = checkRateLimit(`admin-me:${ip}`, 60, 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }
  let email: string | null
  try {
    email = await getSessionEmail(req)
  } catch {
    return NextResponse.json({ error: 'Admin service unavailable.' }, { status: 503 })
  }
  if (!email) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  return NextResponse.json({ email })
}
