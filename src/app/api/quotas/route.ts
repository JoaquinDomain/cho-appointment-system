import { NextResponse } from 'next/server'
import { d1Query } from '@/lib/d1'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

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

  let rows: Array<{ selected_tests: string }>
  try {
    rows = await d1Query<{ selected_tests: string }>(
      'SELECT selected_tests FROM appointments WHERE appointment_date = ?',
      [date]
    )
  } catch (e) {
    console.error('Error fetching quotas:', e)
    return NextResponse.json({ error: 'Failed to fetch quota data' }, { status: 500 })
  }

  const counts: Record<string, number> = {}
  for (const appt of rows) {
    try {
      const tests: unknown = JSON.parse(appt.selected_tests)
      if (Array.isArray(tests)) {
        for (const test of tests) {
          if (typeof test === 'string') counts[test] = (counts[test] || 0) + 1
        }
      }
    } catch {
      // Ignore malformed rows when counting.
    }
  }

  return NextResponse.json({ counts })
}
