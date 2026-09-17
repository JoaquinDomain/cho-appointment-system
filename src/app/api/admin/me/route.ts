import { NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/auth/session'

// check who is logged in
export async function GET(req: Request) {
  let email: string | null
  try {
    email = await getSessionEmail(req)
  } catch {
    return NextResponse.json({ error: 'Admin service unavailable.' }, { status: 503 })
  }
  if (!email) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  return NextResponse.json({ email })
}
