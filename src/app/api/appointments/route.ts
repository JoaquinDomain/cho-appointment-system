import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/admin-auth'
import { validateAppointmentInput } from '@/lib/validation'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { TEST_CONFIG } from '@/lib/types'

// POST /api/appointments — public booking: validated + quota-checked +
// rate-limited. Writes with service_role (bypasses RLS); the server
// generates the UUID (client-supplied `id`, if any, is ignored).
export async function POST(req: Request) {
  const ip = getClientIp(req)
  const rl = checkRateLimit(`book:${ip}`, 10, 10 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many booking attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const parsed = validateAppointmentInput(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: 'Validation failed.', details: parsed.errors }, { status: 400 })
  }

  let service
  try {
    service = getServiceRoleClient()
  } catch (e) {
    console.error('Service client misconfigured:', e)
    return NextResponse.json({ error: 'Booking service unavailable.' }, { status: 503 })
  }

  // Daily per-test quota enforcement against existing bookings for the date.
  const { data: existing, error: quotaError } = await service
    .from('appointments')
    .select('selected_tests')
    .eq('appointment_date', parsed.data.appointment_date)

  if (quotaError) {
    console.error('Quota check failed:', quotaError.message)
    return NextResponse.json({ error: 'Failed to validate test quotas.' }, { status: 500 })
  }

  const counts: Record<string, number> = {}
  for (const appt of existing ?? []) {
    const tests = (appt as { selected_tests?: unknown }).selected_tests
    if (Array.isArray(tests)) {
      for (const t of tests) {
        if (typeof t === 'string') counts[t] = (counts[t] || 0) + 1
      }
    }
  }

  const testConfigs = Object.values(TEST_CONFIG)
  const overLimit: string[] = []
  for (const label of parsed.data.selected_tests) {
    const config = testConfigs.find((t) => t.label === label)
    if (config && (counts[label] || 0) >= config.limit) {
      overLimit.push(`${label} (Limit: ${config.limit}, Booked: ${counts[label]})`)
    }
  }
  if (overLimit.length > 0) {
    return NextResponse.json(
      {
        error: `The following tests have reached their daily booking limit for ${parsed.data.appointment_date}: ${overLimit.join(', ')}`,
      },
      { status: 400 }
    )
  }

  const { error, data } = await service
    .from('appointments')
    .insert(parsed.data)
    .select('id')
    .single()

  if (error || !data) {
    console.error('Booking insert failed:', error?.message)
    // Surface constraint violations as 400, everything else as 500.
    const msg = error?.message ?? ''
    if (/check|constraint|invalid|range|window/i.test(msg)) {
      return NextResponse.json({ error: 'Booking rejected. Please check your inputs.' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create appointment.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: (data as { id: string }).id }, { status: 201 })
}

// GET /api/appointments — admin-only, server-side search/filter/pagination.
// Query: ?page=1&limit=25&search=&facility=&date=YYYY-MM-DD&yakap=true
export async function GET(req: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const ip = getClientIp(req)
  const rl = checkRateLimit(`admin-list:${ip}`, 120, 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const url = new URL(req.url)
  const page = Math.min(Math.max(parseInt(url.searchParams.get('page') ?? '1', 10) || 1, 1), 1000)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '25', 10) || 25, 1), 100)
  const search = (url.searchParams.get('search') ?? '').trim().slice(0, 100)
  const facility = (url.searchParams.get('facility') ?? '').trim().slice(0, 120)
  const date = (url.searchParams.get('date') ?? '').trim()
  const yakapOnly = url.searchParams.get('yakap') === 'true'

  let service
  try {
    service = getServiceRoleClient()
  } catch (e) {
    console.error('Service client misconfigured:', e)
    return NextResponse.json({ error: 'Admin service unavailable.' }, { status: 503 })
  }

  let query = service.from('appointments').select('*', { count: 'exact' })
  if (search) query = query.ilike('patient_name', `%${search.replace(/[%_]/g, '')}%`)
  if (facility) query = query.eq('consultation_facility', facility)
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) query = query.eq('appointment_date', date)
  if (yakapOnly) query = query.eq('yakap_registered', true)

  const from = (page - 1) * limit
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (error) {
    console.error('Admin list failed:', error.message)
    return NextResponse.json({ error: 'Failed to load appointments.' }, { status: 500 })
  }
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit })
}
