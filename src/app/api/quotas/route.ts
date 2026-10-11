import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db/mysql'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { isRealDate } from '@/lib/validation'
import { isMissingStatusColumn } from '@/lib/status-column'
import { isMissingSourceColumn, ensureSourceColumn } from '@/lib/source-column'
import { countBookedTestsBySource, type QuotaRow } from '@/lib/quota-count'

// quota changes on every booking, do not cache
export const dynamic = 'force-dynamic'

// GET /api/quotas?date=YYYY-MM-DD, public. Only test counts, no patient data.
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

  let rows: QuotaRow[]
  try {
    // need status+source so cancelled frees slot and online/walkin split.
    // old db may lack columns, fix then use old query.
    try {
      rows = await dbQuery<QuotaRow>(
        'SELECT selected_tests, status, source FROM appointments WHERE appointment_date = ?',
        [date]
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (isMissingSourceColumn(msg)) {
        await ensureSourceColumn()
        try {
          rows = await dbQuery<QuotaRow>(
            'SELECT selected_tests, status, source FROM appointments WHERE appointment_date = ?',
            [date]
          )
        } catch {
          rows = await dbQuery<QuotaRow>(
            'SELECT selected_tests, status FROM appointments WHERE appointment_date = ?',
            [date]
          )
        }
      } else if (isMissingStatusColumn(msg)) {
        rows = await dbQuery<QuotaRow>('SELECT selected_tests FROM appointments WHERE appointment_date = ?', [
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
    // counts stays online only so booking form still works, others are extra
    { counts: split.online, walkinCounts: split.walkin, totalCounts: split.total },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
