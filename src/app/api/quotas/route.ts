import { NextResponse } from 'next/server'
import { d1Query } from '@/lib/d1'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { isMissingStatusColumn } from '@/lib/status-column'
import { isMissingSourceColumn, ensureSourceColumn } from '@/lib/source-column'
import { countBookedTestsBySource, type QuotaRow } from '@/lib/quota-count'

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
    // Prefer the status+source-aware read so cancelled bookings free their
    // slot and online/walk-in counts split. Pre-migration databases lack
    // the columns — self-heal, then fall back to legacy reads.
    try {
      rows = await d1Query<QuotaRow>(
        'SELECT selected_tests, status, source FROM appointments WHERE appointment_date = ?',
        [date]
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (isMissingSourceColumn(msg)) {
        await ensureSourceColumn()
        try {
          rows = await d1Query<QuotaRow>(
            'SELECT selected_tests, status, source FROM appointments WHERE appointment_date = ?',
            [date]
          )
        } catch {
          rows = await d1Query<QuotaRow>(
            'SELECT selected_tests, status FROM appointments WHERE appointment_date = ?',
            [date]
          )
        }
      } else if (isMissingStatusColumn(msg)) {
        rows = await d1Query<QuotaRow>('SELECT selected_tests FROM appointments WHERE appointment_date = ?', [
          date,
        ])
      } else {
        throw e
      }
    }
  } catch (e) {
    console.error('Error fetching quotas:', e)
    return NextResponse.json({ error: 'Failed to fetch quota data' }, { status: 500 })
  }

  const split = countBookedTestsBySource(rows)
  return NextResponse.json(
    // `counts` stays online-only so existing clients (booking form) keep
    // correct online availability; walkinCounts/totalCounts are additive.
    { counts: split.online, walkinCounts: split.walkin, totalCounts: split.total },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
