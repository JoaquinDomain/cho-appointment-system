import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

// GET /api/quotas?date=YYYY-MM-DD — public aggregate counts per test for a
// date (no PHI: only test labels + counts). Uses service_role because direct
// anon SELECT is RLS-denied; results are aggregated, never row-level.
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

  let service
  try {
    service = getServiceRoleClient()
  } catch {
    return NextResponse.json({ error: 'Quota service unavailable.' }, { status: 503 })
  }

  const { data: appointments, error } = await service
    .from('appointments')
    .select('selected_tests')
    .eq('appointment_date', date)

  if (error) {
    console.error('Error fetching quotas:', error.message)
    return NextResponse.json({ error: 'Failed to fetch quota data' }, { status: 500 })
  }

  const counts: Record<string, number> = {}
  for (const appt of appointments ?? []) {
    const tests = (appt as { selected_tests?: unknown }).selected_tests
    if (Array.isArray(tests)) {
      for (const test of tests) {
        if (typeof test === 'string') counts[test] = (counts[test] || 0) + 1
      }
    }
  }

  return NextResponse.json({ counts })
}
