import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { getBlockedDates } from '@/lib/blocked-dates'

// blocked dates change rarely, but they gate bookings — do not cache
export const dynamic = 'force-dynamic'

// GET /api/blocked-dates, public. Dates only, no patient data.
export async function GET(request: Request) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`blocked-dates:${ip}`, 60, 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  try {
    const map = await getBlockedDates()
    const blocked = [...map.entries()].map(([date, note]) => ({ date, note }))
    return NextResponse.json({ blocked }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('Error fetching blocked dates:', e)
    return NextResponse.json({ error: 'Failed to fetch blocked dates.' }, { status: 500 })
  }
}
