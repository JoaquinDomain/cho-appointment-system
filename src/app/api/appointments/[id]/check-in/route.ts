import { NextResponse } from 'next/server'
import { d1First, d1Run } from '@/lib/db/d1'
import { requireAdmin } from '@/lib/auth/session'
import { isValidUuid } from '@/lib/validation'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { mapAppointmentRow, type AppointmentRow } from '@/lib/appointments'
import { isMissingCheckedInColumn, ensureCheckedInColumn } from '@/lib/checked-in-column'

// Manila time (clinic operates in the Philippines, UTC+8).
function manilaToday(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// POST /api/appointments/[id]/check-in — QR scan check-in, admin only.
// One-time use: sets checked_in_at on the first successful scan.
// Validates appointment status and date so forged/stale QR codes are refused.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const ip = getClientIp(req)
  const rl = checkRateLimit(`checkin:${ip}`, 60, 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const { id } = await params
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid appointment ID.' }, { status: 400 })
  }

  let row: AppointmentRow | null
  try {
    row = await d1First<AppointmentRow>('SELECT * FROM appointments WHERE id = ?', [id])
  } catch (e) {
    console.error('Check-in lookup failed:', e)
    return NextResponse.json({ error: 'Lookup failed.' }, { status: 500 })
  }
  if (!row) return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 })

  const already = row.checked_in_at ?? null
  if (already) {
    return NextResponse.json(
      {
        error: 'QR code already checked in.',
        checked_in_at: already,
        data: mapAppointmentRow(row),
      },
      { status: 409 }
    )
  }

  const status = row.status ?? 'pending'
  if (status === 'cancelled') {
    return NextResponse.json(
      { error: 'Appointment is cancelled.', data: mapAppointmentRow(row) },
      { status: 409 }
    )
  }
  if (status === 'completed') {
    return NextResponse.json(
      { error: 'Appointment already completed.', data: mapAppointmentRow(row) },
      { status: 409 }
    )
  }
  if (row.appointment_date > manilaToday()) {
    return NextResponse.json(
      { error: 'Appointment is not yet due. QR codes can only be used on the appointment date.',
        data: mapAppointmentRow(row) },
      { status: 409 }
    )
  }

  const checkedInAt = new Date().toISOString()
  const markCheckedIn = () =>
    d1Run(
      // guarded: only the first scan wins (race-safe one-time use)
      'UPDATE appointments SET checked_in_at = ? WHERE id = ? AND checked_in_at IS NULL',
      [checkedInAt, id]
    )

  try {
    const changed = await markCheckedIn()
    if (changed === 0) {
      // another scan won the race — re-read to report the real timestamp
      const fresh = await d1First<AppointmentRow>(
        'SELECT * FROM appointments WHERE id = ?',
        [id]
      ).catch(() => null)
      return NextResponse.json(
        {
          error: 'QR code already checked in.',
          checked_in_at: fresh?.checked_in_at ?? checkedInAt,
          data: fresh ? mapAppointmentRow(fresh) : mapAppointmentRow(row),
        },
        { status: 409 }
      )
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (isMissingCheckedInColumn(msg)) {
      const healed = await ensureCheckedInColumn()
      if (healed.ok) {
        try {
          const changed = await markCheckedIn()
          if (changed === 0) {
            return NextResponse.json(
              {
                error: 'QR code already checked in.',
                checked_in_at: row.checked_in_at ?? checkedInAt,
                data: mapAppointmentRow(row),
              },
              { status: 409 }
            )
          }
        } catch (retryErr) {
          console.error('Check-in failed (post-migration retry):', retryErr)
          return NextResponse.json({ error: 'Check-in failed.' }, { status: 500 })
        }
      } else {
        console.error('Check-in failed (migration needed):', healed.message)
        return NextResponse.json({ error: 'Check-in failed.' }, { status: 500 })
      }
    } else {
      console.error('Check-in failed:', e)
      return NextResponse.json({ error: 'Check-in failed.' }, { status: 500 })
    }
  }

  return NextResponse.json({
    data: { ...mapAppointmentRow(row), checked_in_at: checkedInAt },
    checked_in_at: checkedInAt,
  })
}
