import { NextResponse } from 'next/server'
import { d1First, d1Run } from '@/lib/d1'
import { requireAdmin } from '@/lib/session'
import { isValidUuid } from '@/lib/validation'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { mapAppointmentRow, type AppointmentRow } from '@/lib/appointments'

// GET /api/appointments/[id] — admin-only single record (QR scan lookup).
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

// DELETE /api/appointments/[id] — admin-only.
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
