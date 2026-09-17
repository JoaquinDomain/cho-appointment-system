import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { d1Query, d1Run } from '@/lib/db/d1'
import { requireAdmin } from '@/lib/auth/session'
import { validateAppointmentInput } from '@/lib/validation'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { TEST_CONFIG, onlineLimitForTest } from '@/lib/types'
import { mapAppointmentRow, escapeLike, type AppointmentRow } from '@/lib/appointments'
import { toSafeDetail } from '@/lib/utils/safe-detail'
import { ensureStatusColumn, isMissingStatusColumn } from '@/lib/status-column'
import { isMissingSourceColumn, ensureSourceColumn } from '@/lib/source-column'
import { isMissingContactColumn, ensureContactColumn } from '@/lib/contact-column'
import { countBookedTestsBySource, type QuotaRow } from '@/lib/quota-count'
import { verifyTurnstile } from '@/lib/security/turnstile'

// POST /api/appointments, public booking. With validation, quota and rate limit.
// Server makes the id, ignore any id from client.
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

  // turnstile check, only if keys are set so local dev still works
  if (process.env.TURNSTILE_SECRET_KEY) {
    const b =
      body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    const token = String(b.turnstileToken ?? '')
    if (token) {
      const check = await verifyTurnstile(token, ip)
      if (!check.ok) {
        return NextResponse.json(
          { error: 'Human verification failed. Please refresh and try again.' },
          { status: 403 }
        )
      }
    } else if (b.turnstileUnavailable === true) {
      // fallback for phones that cannot load cloudflare (seen on PH mobile data)
      // check honeypot, how long the form was open, plus strict limit per IP
      // note: rate limit is per server only, but honeypot and fill time always run
      const trap = String(b.website ?? '')
      const startedAt = Number(b.formStartedAt ?? 0)
      const fillMs = Date.now() - startedAt
      const humanTiming =
        Number.isFinite(fillMs) && fillMs >= 4000 && fillMs < 6 * 60 * 60 * 1000
      const rlStrict = checkRateLimit(`book-unverified:${ip}`, 3, 60 * 60 * 1000)
      if (trap !== '' || !humanTiming || !rlStrict.allowed) {
        return NextResponse.json(
          { error: 'Human verification failed. Please refresh and try again.' },
          { status: 403 }
        )
      }
    } else {
      const check = await verifyTurnstile(token, ip)
      if (!check.ok) {
        return NextResponse.json(
          { error: 'Human verification failed. Please refresh and try again.' },
          { status: 403 }
        )
      }
    }
  }

  const parsed = validateAppointmentInput(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: 'Validation failed.', details: parsed.errors }, { status: 400 })
  }

  let existing: QuotaRow[]
  try {
    // read by date. cancelled frees the slot, walkins are separate
    // so online booking does not eat the walkin half.
    // old db may not have the new columns, fix then use old query.
    try {
      existing = await d1Query<QuotaRow>(
        'SELECT selected_tests, status, source FROM appointments WHERE appointment_date = ?',
        [parsed.data.appointment_date]
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (isMissingSourceColumn(msg)) {
        await ensureSourceColumn()
        try {
          existing = await d1Query<QuotaRow>(
            'SELECT selected_tests, status, source FROM appointments WHERE appointment_date = ?',
            [parsed.data.appointment_date]
          )
        } catch {
          existing = await d1Query<QuotaRow>(
            'SELECT selected_tests, status FROM appointments WHERE appointment_date = ?',
            [parsed.data.appointment_date]
          )
        }
      } else if (isMissingStatusColumn(msg)) {
        existing = await d1Query<QuotaRow>(
          'SELECT selected_tests FROM appointments WHERE appointment_date = ?',
          [parsed.data.appointment_date]
        )
      } else {
        throw e
      }
    }
  } catch (e) {
    console.error('Quota check failed:', e)
    const msg = e instanceof Error ? e.message : ''
    if (/Missing D1 env/i.test(msg)) {
      return NextResponse.json(
        {
          error: 'Failed to validate test quotas.',
          details:
            'Booking service is not configured. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and CLOUDFLARE_D1_API_TOKEN.',
        },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: 'Failed to validate test quotas.' }, { status: 500 })
  }

  // same counting as quotas api, online only
  const counts = countBookedTestsBySource(existing).online

  const testConfigs = Object.values(TEST_CONFIG)
  const overLimit: string[] = []
  for (const label of parsed.data.selected_tests) {
    const config = testConfigs.find((t) => t.label === label)
    // ECG uses full limit, others use online half
    const onlineLimit = config ? onlineLimitForTest(config.limit, label) : 0
    if (config && (counts[label] || 0) >= onlineLimit) {
      overLimit.push(`${label} (Online limit: ${onlineLimit}, Booked: ${counts[label]})`)
    }
  }
  if (overLimit.length > 0) {
    return NextResponse.json(
      {
        error: `Online slots for ${parsed.data.appointment_date} are full (half of daily capacity is reserved for walk-ins): ${overLimit.join(', ')}. Please select another day that still has online slots.`,
      },
      { status: 400 }
    )
  }

  const id = randomUUID()
  const createdAt = new Date().toISOString()
  const params = [
    id,
    parsed.data.patient_name,
    parsed.data.age,
    parsed.data.contact_number,
    parsed.data.consultation_facility,
    parsed.data.yakap_registered ? 1 : 0,
    parsed.data.yakap_facility,
    JSON.stringify(parsed.data.selected_tests),
    parsed.data.appointment_date,
    createdAt,
  ]
  const insertMain = () =>
    d1Run(
      `INSERT INTO appointments
        (id, patient_name, age, contact_number, consultation_facility, yakap_registered, yakap_facility, selected_tests, appointment_date, status, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'online', ?)`,
      params
    )
  try {
    await insertMain()
  } catch (e) {
    // if contact_number column is missing, add it then try again
    if (isMissingContactColumn(e instanceof Error ? e.message : '')) {
      const healed = await ensureContactColumn()
      if (healed.ok) {
        try {
          await insertMain()
          return NextResponse.json({ success: true, id }, { status: 201 })
        } catch (retryErr) {
          e = retryErr
        }
      }
    }
    const msg = e instanceof Error ? e.message : ''
    // old db has no status/source yet, use old insert so booking still works
    if (isMissingStatusColumn(msg) || isMissingSourceColumn(msg)) {
      console.warn(
        'appointments.status/source/contact column missing - booking with legacy schema. ' +
          'Run: npx wrangler d1 execute cho-appointments --remote --file=./d1/migrate_status.sql, ./d1/migrate_source.sql and ./d1/migrate_contact.sql'
      )
      try {
        await d1Run(
          `INSERT INTO appointments
            (id, patient_name, age, consultation_facility, yakap_registered, yakap_facility, selected_tests, appointment_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params
        )
      } catch (retryErr) {
        console.error('Booking insert failed (legacy retry):', retryErr)
        const retryMsg = retryErr instanceof Error ? retryErr.message : ''
        return NextResponse.json(
          { error: 'Failed to create appointment.', details: toSafeDetail(retryMsg) },
          { status: 500 }
        )
      }
    } else {
      console.error('Booking insert failed:', e)
      if (/CHECK|constraint/i.test(msg)) {
        return NextResponse.json({ error: 'Booking rejected. Please check your inputs.' }, { status: 400 })
      }
      if (/no such table/i.test(msg)) {
        return NextResponse.json(
          {
            error: 'Failed to create appointment.',
            details:
              'Appointments table not found. Apply the database schema: npx wrangler d1 execute cho-appointments --remote --file=./d1/schema.sql',
          },
          { status: 500 }
        )
      }
      if (/Missing D1 env/i.test(msg)) {
        return NextResponse.json(
          {
            error: 'Failed to create appointment.',
            details:
              'Booking service is not configured. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and CLOUDFLARE_D1_API_TOKEN.',
          },
          { status: 500 }
        )
      }
      if (/unauthor|forbidden|permission|read.only|invalid.*token|HTTP 40[13]/i.test(msg)) {
        return NextResponse.json(
          {
            error: 'Failed to create appointment.',
            details:
              'The database token cannot write (reads work, inserts fail). Use a Cloudflare API token with D1 Edit permission.',
          },
          { status: 500 }
        )
      }
      // show real db error (cleaned) instead of generic fail
      return NextResponse.json(
        { error: 'Failed to create appointment.', details: toSafeDetail(msg) },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ success: true, id }, { status: 201 })
}

// GET /api/appointments, admin only with search/filter/pages
// ?page=1&limit=25&search=&facility=&date=&from=&to=&status=&yakap=true
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
    // match name or exact id (for pasting id from confirmation)
    clauses.push(`(patient_name LIKE ? ESCAPE '\\' OR id = ?)`)
    params.push(`%${escapeLike(search)}%`, search)
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

  const runList = () =>
    Promise.all([
      d1Query<{ total: number }>(`SELECT COUNT(*) AS total FROM appointments ${where}`, params),
      d1Query<AppointmentRow>(
        `SELECT * FROM appointments ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit]
      ),
    ])

  try {
    const [countRow, rows] = await runList()
    return NextResponse.json({
      data: rows.map(mapAppointmentRow),
      total: countRow[0]?.total ?? 0,
      page,
      limit,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    // old db has no status column, add then try once
    if (isMissingStatusColumn(msg)) {
      const healed = await ensureStatusColumn()
      if (healed.ok) {
        try {
          const [countRow, rows] = await runList()
          return NextResponse.json({
            data: rows.map(mapAppointmentRow),
            total: countRow[0]?.total ?? 0,
            page,
            limit,
          })
        } catch (retryErr) {
          console.error('Admin list failed (post-migration retry):', retryErr)
          return NextResponse.json(
            { error: 'Failed to load appointments.', details: toSafeDetail(retryErr instanceof Error ? retryErr.message : '') },
            { status: 500 }
          )
        }
      }
      console.error('Admin list failed (migration needed):', e)
      return NextResponse.json(
        { error: 'Failed to load appointments.', details: healed.message },
        { status: 500 }
      )
    }
    console.error('Admin list failed:', e)
    return NextResponse.json({ error: 'Failed to load appointments.' }, { status: 500 })
  }
}
