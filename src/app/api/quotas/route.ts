import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { isRealDate } from '@/lib/validation'
import { getCapacitySnapshot } from '@/lib/test-capacities'

// quota changes on every booking, do not cache
export const dynamic = 'force-dynamic'

// GET /api/quotas?date=YYYY-MM-DD, public. Only test counts/capacities,
// no patient data. `counts` remains the online-only map for compatibility;
// `capacities`/`available` are the admin-managed online values and
// `walkinCapacities`/`walkinAvailable` are the walk-in values.
export async function GET(request: Request) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`quotas:${ip}`, 60, 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const date = (searchParams.get('date') ?? '').trim()

  if (!isRealDate(date)) {
    return NextResponse.json(
      { error: 'Date parameter must be a real calendar date in YYYY-MM-DD form.' },
      { status: 400 }
    )
  }

  try {
    const snapshot = await getCapacitySnapshot(date)
    return NextResponse.json(
      {
        date: snapshot.date,
        counts: snapshot.counts,
        walkinCounts: snapshot.walkinCounts,
        totalCounts: snapshot.totalCounts,
        capacities: snapshot.capacities,
        walkinCapacities: snapshot.walkinCapacities,
        available: snapshot.available,
        walkinAvailable: snapshot.walkinAvailable,
        tests: snapshot.tests,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e) {
    console.error('Error fetching quotas:', e)
    return NextResponse.json({ error: 'Failed to fetch quota data' }, { status: 500 })
  }
}
