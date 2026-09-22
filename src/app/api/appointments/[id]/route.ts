import { NextResponse } from 'next/server'
import { d1First, d1Run } from '@/lib/db/d1'
import { requireAdmin } from '@/lib/auth/session'
import { isValidUuid, isValidStatus, validateAppointmentInput } from '@/lib/validation'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { mapAppointmentRow, type AppointmentRow } from '@/lib/appointments'
import { toSafeDetail } from '@/lib/utils/safe-detail'
import { ensureStatusColumn, isMissingStatusColumn } from '@/lib/status-column'
import { isMissingContactColumn, ensureContactColumn } from '@/lib/contact-column'
import { isMissingNameColumn, ensureNameColumns } from '@/lib/name-columns'

// GET one record for admin (used by QR scan).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(_req)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const { id } = await params
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid appointment ID.' }, { status: 400 })
  }

  let row: AppointmentRow | null
  try {
    row = await d1First<AppointmentRow>('SELECT * FROM appointments WHERE id = ?', [id])
  } catch (e) {
    console.error('Admin lookup failed:', e)
    return NextResponse.json({ error: 'Lookup failed.' }, { status: 500 })
  }
  if (!row) return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 })
  return NextResponse.json({ data: mapAppointmentRow(row) })
}

// PATCH status only: { status }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const { id } = await params
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid appointment ID.' }, { status: 400 })
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const status = (body as Record<string, unknown>)?.status
  if (!isValidStatus(status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
  }
  try {
    const changed = await d1Run('UPDATE appointments SET status = ? WHERE id = ?', [status, id])
    if (changed === 0) return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    // old db has no status column, add it then try once
    if (isMissingStatusColumn(msg)) {
      const healed = await ensureStatusColumn()
      if (healed.ok) {
        try {
          const changed = await d1Run('UPDATE appointments SET status = ? WHERE id = ?', [status, id])
          if (changed === 0) return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 })
        } catch (retryErr) {
          console.error('Admin status update failed (post-migration retry):', retryErr)
          return NextResponse.json(
            {
              error: 'Failed to update status.',
              details: toSafeDetail(retryErr instanceof Error ? retryErr.message : ''),
            },
            { status: 500 }
          )
        }
      } else {
        console.error('Admin status update failed (migration needed):', e)
        return NextResponse.json(
          { error: 'Failed to update status.', details: healed.message },
          { status: 500 }
        )
      }
    } else {
      console.error('Admin status update failed:', e)
      return NextResponse.json(
        { error: 'Failed to update status.', details: toSafeDetail(msg) },
        { status: 500 }
      )
    }
  }
  return NextResponse.json({ ok: true, status })
}

// PUT full edit, admin only. Same validation as booking.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const { id } = await params
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid appointment ID.' }, { status: 400 })
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
  const updateParams = [
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
    JSON.stringify(parsed.data.selected_tests),
    parsed.data.appointment_date,
    id,
  ]
  const updateMain = () =>
    d1Run(
      `UPDATE appointments SET patient_name = ?, last_name = ?, first_name = ?, middle_name = ?, birthdate = ?, age = ?, contact_number = ?, consultation_facility = ?,
        yakap_registered = ?, yakap_facility = ?, selected_tests = ?, appointment_date = ? WHERE id = ?`,
      updateParams
    )
  try {
    const changed = await updateMain()
    if (changed === 0) return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 })
  } catch (e) {
    // if contact or name/birthdate columns missing, add then try once
    if (isMissingContactColumn(e instanceof Error ? e.message : '')) {
      const healed = await ensureContactColumn()
      if (healed.ok) {
        try {
          const changed = await updateMain()
          if (changed === 0) return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 })
          return NextResponse.json({ ok: true })
        } catch (retryErr) {
          console.error('Admin edit failed (post-migration retry):', retryErr)
          return NextResponse.json({ error: 'Failed to update appointment.' }, { status: 500 })
        }
      }
    }
    if (isMissingNameColumn(e instanceof Error ? e.message : '')) {
      const healed = await ensureNameColumns()
      if (healed.ok) {
        try {
          const changed = await updateMain()
          if (changed === 0) return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 })
          return NextResponse.json({ ok: true })
        } catch (retryErr) {
          console.error('Admin edit failed (post-migration retry):', retryErr)
          return NextResponse.json({ error: 'Failed to update appointment.' }, { status: 500 })
        }
      }
    }
    console.error('Admin edit failed:', e)
    return NextResponse.json({ error: 'Failed to update appointment.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// DELETE one record, admin only.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const ip = getClientIp(req)
  const rl = checkRateLimit(`admin-delete:${ip}`, 30, 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const { id } = await params
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid appointment ID.' }, { status: 400 })
  }

  try {
    await d1Run('DELETE FROM appointments WHERE id = ?', [id])
  } catch (e) {
    console.error('Admin delete failed:', e)
    return NextResponse.json({ error: 'Failed to delete appointment.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
