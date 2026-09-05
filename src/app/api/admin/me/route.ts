import { NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/session'

// GET /api/admin/me — returns the logged-in admin email, or 401.
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
