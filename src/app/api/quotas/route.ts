import { NextResponse } from 'next/server'
import { d1Query } from '@/lib/d1'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { isMissingStatusColumn } from '@/lib/status-column'
import { countBookedTests, type QuotaRow } from '@/lib/quota-count'

// Quota counts change on every booking — never cache this response.
export const dynamic = 'force-dynamic'

// GET /api/quotas?date=YYYY-MM-DD — public aggregate counts per test for a
// date (no PHI: only test labels + counts).
export async function GET(request: Request) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`quotas:${ip}`, 60, 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const date = (searchParams.get('date') ?? '').trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Date parameter must be YYYY-MM-DD.' }, { status: 400 })
  }

  let rows: QuotaRow[]
  try {
    // Prefer the status-aware read so cancelled bookings free their slot.
    // Pre-migration databases lack the column — fall back to the legacy read.
    try {
      rows = await d1Query<QuotaRow>(
        'SELECT selected_tests, status FROM appointments WHERE appointment_date = ?',
        [date]
      )
    } catch (e) {
      if (!isMissingStatusColumn(e instanceof Error ? e.message : '')) throw e
      rows = await d1Query<QuotaRow>('SELECT selected_tests FROM appointments WHERE appointment_date = ?', [
        date,
      ])
    }
  } catch (e) {
    console.error('Error fetching quotas:', e)
    return NextResponse.json({ error: 'Failed to fetch quota data' }, { status: 500 })
  }

  return NextResponse.json(
    { counts: countBookedTests(rows) },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
