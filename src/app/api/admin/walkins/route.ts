import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { d1Query, d1Run } from '@/lib/d1'
import { requireAdmin } from '@/lib/session'
import { validateAppointmentInput } from '@/lib/validation'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { TEST_CONFIG, onlineLimitFor } from '@/lib/types'
import { isMissingStatusColumn } from '@/lib/status-column'
import { isMissingSourceColumn, ensureSourceColumn } from '@/lib/source-column'
import { isMissingContactColumn, ensureContactColumn } from '@/lib/contact-column'
import { countBookedTestsBySource, type QuotaRow } from '@/lib/quota-count'
import { toSafeDetail } from '@/lib/safe-detail'

// POST /api/admin/walkins — admin-only walk-in registration (patient is
// physically present). No Turnstile: the staff session is the human proof.
// Quota rule differs from online booking: walk-ins may use the held-back
// half, so the check is against TOTAL daily capacity per test.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const ip = getClientIp(req)
  const rl = checkRateLimit(`walkin:${ip}`, 60, 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
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

  let existing: QuotaRow[]
  try {
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
    console.error('Walk-in quota check failed:', e)
    return NextResponse.json({ error: 'Failed to validate test quotas.' }, { status: 500 })
  }

  // Walk-ins draw from the held-back half: each test's walk-in bookings
  // must stay under (total limit − online limit), and total bookings under
  // the full daily limit.
  const split = countBookedTestsBySource(existing)
  const testConfigs = Object.values(TEST_CONFIG)
  const overLimit: string[] = []
  for (const label of parsed.data.selected_tests) {
    const config = testConfigs.find(t => t.label === label)
    if (!config) continue
    const heldLimit = config.limit - onlineLimitFor(config.limit)
    const walkinBooked = split.walkin[label] || 0
    const totalBooked = split.total[label] || 0
    if (walkinBooked >= heldLimit) {
      overLimit.push(`${label} (Walk-in limit: ${heldLimit}, Booked: ${walkinBooked})`)
    } else if (totalBooked >= config.limit) {
      overLimit.push(`${label} (Daily limit: ${config.limit}, Booked: ${totalBooked})`)
    }
  }
  if (overLimit.length > 0) {
    return NextResponse.json(
      {
        error: `Daily capacity for ${parsed.data.appointment_date} is full, including walk-in slots: ${overLimit.join(', ')}.`,
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
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'walkin', ?)`,
      params
    )
  try {
    await insertMain()
  } catch (e) {
    // Self-heal for the contact_number column, then retry the full insert.
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
    if (isMissingStatusColumn(msg) || isMissingSourceColumn(msg)) {
      try {
        await d1Run(
          `INSERT INTO appointments
            (id, patient_name, age, consultation_facility, yakap_registered, yakap_facility, selected_tests, appointment_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params
        )
      } catch (retryErr) {
        console.error('Walk-in insert failed (legacy retry):', retryErr)
        return NextResponse.json(
          { error: 'Failed to register walk-in.', details: toSafeDetail(retryErr instanceof Error ? retryErr.message : '') },
          { status: 500 }
        )
      }
    } else {
      console.error('Walk-in insert failed:', e)
      if (/CHECK|constraint/i.test(msg)) {
        return NextResponse.json({ error: 'Walk-in rejected. Please check the inputs.' }, { status: 400 })
      }
      return NextResponse.json(
        { error: 'Failed to register walk-in.', details: toSafeDetail(msg) },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ success: true, id }, { status: 201 })
}
