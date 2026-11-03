import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { dbQuery, dbTransaction } from '@/lib/db/mysql'
import { requireAdmin } from '@/lib/auth/session'
import { validateAppointmentInput } from '@/lib/validation'
import { checkRateLimit, getClientIp, limitFromEnv } from '@/lib/security/rate-limit'
import { ensureTestCapacitiesTable } from '@/lib/test-capacities'
import { mapAppointmentRow, escapeLike, type AppointmentRow } from '@/lib/appointments'
import { ensureStatusColumn, isMissingStatusColumn } from '@/lib/status-column'
import { isMissingSourceColumn, ensureSourceColumn } from '@/lib/source-column'
import { isMissingContactColumn, ensureContactColumn } from '@/lib/contact-column'
import { isMissingNameColumn, ensureNameColumns } from '@/lib/name-columns'
import { countBookedTestsBySource, type QuotaRow } from '@/lib/quota-count'
import { verifyTurnstile } from '@/lib/security/turnstile'
import { getDateBlockNote } from '@/lib/blocked-dates'

// POST /api/appointments, public booking. With validation, quota and rate limit.
// Server makes the id, ignore any id from client.
export async function POST(req: Request) {
  const ip = getClientIp(req)
  const bookLimit = limitFromEnv('RL_BOOK_IP', 10, 10 * 60 * 1000)
  const rl = checkRateLimit(`book:${ip}`, bookLimit.limit, bookLimit.windowMs)
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

  // human verification: fail closed in production if the secret is missing
  const hasTurnstileSecret = Boolean(process.env.TURNSTILE_SECRET_KEY)
  if (!hasTurnstileSecret && process.env.NODE_ENV === 'production') {
    console.error('TURNSTILE_SECRET_KEY is not set — rejecting booking (fail closed).')
    return NextResponse.json(
      { error: 'Booking is temporarily unavailable. Please try again later.' },
      { status: 503 }
    )
  }
  if (hasTurnstileSecret) {
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
      const strictLimit = limitFromEnv('RL_BOOK_UNVERIFIED_IP', 3, 60 * 60 * 1000)
      const rlStrict = checkRateLimit(
        `book-unverified:${ip}`,
        strictLimit.limit,
        strictLimit.windowMs
      )
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

  // date blocked by an admin: no new bookings, whatever the quota says.
  // Existing appointments on that date are untouched.
  try {
    const note = await getDateBlockNote(parsed.data.appointment_date)
    if (note !== null) {
      return NextResponse.json(
        {
          error: 'This date is unavailable.',
          details: [note ? `${note} Please choose another day.` : 'Please choose another day.'],
        },
        { status: 409 }
      )
    }
  } catch (e) {
    // fail closed: without a working lookup the booking must not go through
    console.error('Blocked date check failed:', e)
    return NextResponse.json({ error: 'Failed to validate the appointment date.' }, { status: 500 })
  }

  const id = randomUUID()
  const createdAt = new Date().toISOString()
  const selectedTests = parsed.data.selected_tests
  const capacityPlaceholders = selectedTests.map(() => '?').join(', ')
  const params = [
    id,
    parsed.data.patient_name,
    parsed.data.last_name,
    parsed.data.first_name,
    parsed.data.middle_name,
    parsed.data.birthdate,
    parsed.data.age,
    parsed.data.contact_number,
    parsed.data.consultation_facility,
    parsed.data.yakap_registered ? 1 : 0,
    parsed.data.yakap_facility,
    JSON.stringify(selectedTests),
    parsed.data.appointment_date,
    createdAt,
  ]
  const insertSql = `INSERT INTO appointments
    (id, patient_name, last_name, first_name, middle_name, birthdate, age, contact_number, consultation_facility, yakap_registered, yakap_facility, selected_tests, appointment_date, status, source, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'online', ?)`

  type BookingResult =
    | { booked: true }
    | { booked: false; overLimit: string[] }

  // Serialize all online bookings for the selected tests on their capacity
  // rows, then count and insert in the same transaction. A second request for
  // the same full test waits for the first to commit, so two concurrent
  // requests cannot both take the last slot.
  const runBooking = () =>
    dbTransaction<BookingResult>(async (tx) => {
      const capacityRows = await tx.query<{
        test_label: string
        max_online_capacity: number | string
      }>(
        `SELECT test_label, max_online_capacity
         FROM test_capacities
         WHERE test_label IN (${capacityPlaceholders})
         ORDER BY test_label
         FOR UPDATE`,
        selectedTests
      )

      const capacities = new Map<string, number>()
      for (const row of capacityRows) {
        const value = Number(row.max_online_capacity)
        capacities.set(
          row.test_label,
          Number.isInteger(value) && value >= 0 ? value : 0
        )
      }
      const missing = selectedTests.filter((label) => !capacities.has(label))
      if (missing.length > 0) {
        throw new Error(`Missing test capacity row(s): ${missing.join(', ')}`)
      }

      const existing = await tx.query<QuotaRow>(
        'SELECT selected_tests, status, source FROM appointments WHERE appointment_date = ? FOR UPDATE',
        [parsed.data.appointment_date]
      )
      const counts = countBookedTestsBySource(existing).online

      const overLimit: string[] = []
      for (const label of selectedTests) {
        const capacity = capacities.get(label) ?? 0
        if ((counts[label] || 0) >= capacity) {
          overLimit.push(
            `${label} (Online capacity: ${capacity}, Booked: ${counts[label] || 0})`
          )
        }
      }
      if (overLimit.length > 0) return { booked: false, overLimit }

      await tx.run(insertSql, params)
      return { booked: true }
    }, { readCommitted: true })

  try {
    await ensureTestCapacitiesTable()
  } catch (e) {
    console.error('Capacity table initialization failed:', e)
    return NextResponse.json({ error: 'Failed to validate test capacities.' }, { status: 500 })
  }

  let result: BookingResult
  let deadlockRetries = 0
  let healedContact = false
  let healedName = false
  let healedStatus = false
  let healedSource = false
  for (;;) {
    try {
      result = await runBooking()
      break
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''

      if (/deadlock|lock wait timeout/i.test(msg) && deadlockRetries < 3) {
        deadlockRetries += 1
        await new Promise((resolve) => setTimeout(resolve, 25 * deadlockRetries))
        continue
      }

      // very old database: add the missing columns, then re-run the whole
      // transaction so capacity is rechecked after the schema change.
      if (isMissingContactColumn(msg) && !healedContact) {
        healedContact = true
        const healed = await ensureContactColumn()
        if (healed.ok) continue
        console.error('Capacity booking needs contact-number migration:', healed.message)
      } else if (isMissingNameColumn(msg) && !healedName) {
        healedName = true
        const healed = await ensureNameColumns()
        if (healed.ok) continue
        console.error('Capacity booking needs names/birthday migration:', healed.message)
      } else if (isMissingStatusColumn(msg) && !healedStatus) {
        healedStatus = true
        const healed = await ensureStatusColumn()
        if (healed.ok) continue
        console.error('Capacity booking needs status migration:', healed.message)
      } else if (isMissingSourceColumn(msg) && !healedSource) {
        healedSource = true
        const healed = await ensureSourceColumn()
        if (healed.ok) continue
        console.error('Capacity booking needs source migration:', healed.message)
      }

      // details stay in server logs — never sent to clients
      console.error('Booking failed:', e)
      if (/CHECK|constraint/i.test(msg)) {
        return NextResponse.json({ error: 'Booking rejected. Please check your inputs.' }, { status: 400 })
      }
      if (/no such table|doesn't exist/i.test(msg)) {
        console.error(
          'Appointments or test_capacities table not found. Apply the database schema: mysql -h <host> -u <user> -p <database> < ./mysql/schema.sql'
        )
      }
      if (/Missing MySQL env/i.test(msg)) {
        console.error(
          'Booking service is not configured. Set MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE, MYSQL_USER and MYSQL_PASSWORD.'
        )
      }
      if (/access denied|ER_ACCESS_DENIED|ER_BAD_DB_ERROR|not allowed to connect/i.test(msg)) {
        console.error(
          'The MySQL account cannot use the database (check MYSQL_USER / MYSQL_PASSWORD grants for bcho_lab_appointment).'
        )
      }
      return NextResponse.json({ error: 'Failed to create appointment.' }, { status: 500 })
    }
  }

  if (!result.booked) {
    return NextResponse.json(
      {
        error: `Online slots for ${parsed.data.appointment_date} are full: ${result.overLimit.join(', ')}. Please select another day or another test.`,
      },
      { status: 400 }
    )
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
    // match display name, split names, or exact id (for pasting id from confirmation)
    clauses.push(
      `(patient_name LIKE ? ESCAPE '!' OR last_name LIKE ? ESCAPE '!' OR first_name LIKE ? ESCAPE '!' OR middle_name LIKE ? ESCAPE '!' OR id = ?)`
    )
    const like = `%${escapeLike(search)}%`
    params.push(like, like, like, like, search)
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
      dbQuery<{ total: number }>(`SELECT COUNT(*) AS total FROM appointments ${where}`, params),
      dbQuery<AppointmentRow>(
        `SELECT * FROM appointments ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit]
      ),
    ])

  try {
    const [countRow, rows] = await runList()
    return NextResponse.json({
      data: rows.map(mapAppointmentRow),
      total: Number(countRow[0]?.total ?? 0),
      page,
      limit,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    // old db without split-name columns: add them then try once
    if (isMissingNameColumn(msg)) {
      const healed = await ensureNameColumns()
      if (healed.ok) {
        try {
          const [countRow, rows] = await runList()
          return NextResponse.json({
            data: rows.map(mapAppointmentRow),
            total: Number(countRow[0]?.total ?? 0),
            page,
            limit,
          })
        } catch (retryErr) {
          console.error('Admin list failed (post-migration retry):', retryErr)
          return NextResponse.json({ error: 'Failed to load appointments.' }, { status: 500 })
        }
      }
      console.error('Admin list failed (migration needed):', e, healed.message)
      return NextResponse.json({ error: 'Failed to load appointments.' }, { status: 500 })
    }
    // old db has no status column, add then try once
    if (isMissingStatusColumn(msg)) {
      const healed = await ensureStatusColumn()
      if (healed.ok) {
        try {
          const [countRow, rows] = await runList()
          return NextResponse.json({
            data: rows.map(mapAppointmentRow),
            total: Number(countRow[0]?.total ?? 0),
            page,
            limit,
          })
        } catch (retryErr) {
          console.error('Admin list failed (post-migration retry):', retryErr)
          return NextResponse.json({ error: 'Failed to load appointments.' }, { status: 500 })
        }
      }
      console.error('Admin list failed (migration needed):', e, healed.message)
      return NextResponse.json({ error: 'Failed to load appointments.' }, { status: 500 })
    }
    console.error('Admin list failed:', e)
    return NextResponse.json({ error: 'Failed to load appointments.' }, { status: 500 })
  }
}
