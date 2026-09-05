import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { d1Query, d1Run } from '@/lib/d1'
import { requireAdmin } from '@/lib/session'
import { validateAppointmentInput } from '@/lib/validation'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { TEST_CONFIG } from '@/lib/types'
import { mapAppointmentRow, escapeLike, type AppointmentRow } from '@/lib/appointments'

// POST /api/appointments — public booking: validated + quota-checked +
// rate-limited. The server generates the UUID (client `id`, if any, ignored).
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

  let existing: Array<{ selected_tests: string }>
  try {
    existing = await d1Query<{ selected_tests: string }>(
      'SELECT selected_tests FROM appointments WHERE appointment_date = ?',
      [parsed.data.appointment_date]
    )
  } catch (e) {
    console.error('Quota check failed:', e)
    return NextResponse.json({ error: 'Failed to validate test quotas.' }, { status: 500 })
  }

  const counts: Record<string, number> = {}
  for (const appt of existing) {
    try {
      const tests: unknown = JSON.parse(appt.selected_tests)
      if (Array.isArray(tests)) {
        for (const t of tests) {
          if (typeof t === 'string') counts[t] = (counts[t] || 0) + 1
        }
      }
    } catch {
      // Ignore malformed rows when counting.
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

  const id = randomUUID()
  const createdAt = new Date().toISOString()
  try {
    await d1Run(
      `INSERT INTO appointments
        (id, patient_name, age, consultation_facility, yakap_registered, yakap_facility, selected_tests, appointment_date, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        id,
        parsed.data.patient_name,
        parsed.data.age,
        parsed.data.consultation_facility,
        parsed.data.yakap_registered ? 1 : 0,
        parsed.data.yakap_facility,
        JSON.stringify(parsed.data.selected_tests),
        parsed.data.appointment_date,
        createdAt,
      ]
    )
  } catch (e) {
    console.error('Booking insert failed:', e)
    const msg = e instanceof Error ? e.message : ''
    if (/CHECK|constraint/i.test(msg)) {
      return NextResponse.json({ error: 'Booking rejected. Please check your inputs.' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create appointment.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, id }, { status: 201 })
}

// GET /api/appointments — admin-only, server-side search/filter/pagination.
// Query: ?page=1&limit=25&search=&facility=&date=YYYY-MM-DD&from=YYYY-MM-DD&to=YYYY-MM-DD&status=pending&yakap=true
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
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
  const from = (url.searchParams.get('from') ?? '').trim()
  const to = (url.searchParams.get('to') ?? '').trim()
  const status = (url.searchParams.get('status') ?? '').trim()
  const yakapOnly = url.searchParams.get('yakap') === 'true'
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

  const clauses: string[] = []
  const params: unknown[] = []
  if (search) {
    clauses.push(`patient_name LIKE ? ESCAPE '\\'`)
    params.push(`%${escapeLike(search)}%`)
  }
  if (facility) {
    clauses.push('consultation_facility = ?')
    params.push(facility)
  }
  if (DATE_RE.test(date)) {
    clauses.push('appointment_date = ?')
    params.push(date)
  } else {
    if (DATE_RE.test(from)) {
      clauses.push('appointment_date >= ?')
      params.push(from)
    }
    if (DATE_RE.test(to)) {
      clauses.push('appointment_date <= ?')
      params.push(to)
    }
  }
  if (['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
    clauses.push('status = ?')
    params.push(status)
  }
  if (yakapOnly) clauses.push('yakap_registered = 1')
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

  try {
    const [countRow, rows] = await Promise.all([
      d1Query<{ total: number }>(`SELECT COUNT(*) AS total FROM appointments ${where}`, params),
      d1Query<AppointmentRow>(
        `SELECT * FROM appointments ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit]
      ),
    ])
    return NextResponse.json({
      data: rows.map(mapAppointmentRow),
      total: countRow[0]?.total ?? 0,
      page,
      limit,
    })
  } catch (e) {
    console.error('Admin list failed:', e)
    return NextResponse.json({ error: 'Failed to load appointments.' }, { status: 500 })
  }
}
