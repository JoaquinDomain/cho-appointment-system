import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/admin-auth'
import { isValidUuid } from '@/lib/validation'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

// GET /api/appointments/[id] — admin-only single record (used by QR scan lookup).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const { id } = await params
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid appointment ID.' }, { status: 400 })
  }

  let service
  try {
    service = getServiceRoleClient()
  } catch {
    return NextResponse.json({ error: 'Admin service unavailable.' }, { status: 503 })
  }

  const { data, error } = await service.from('appointments').select('*').eq('id', id).maybeSingle()
  if (error) {
    console.error('Admin lookup failed:', error.message)
    return NextResponse.json({ error: 'Lookup failed.' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 })
  return NextResponse.json({ data })
}

// DELETE /api/appointments/[id] — admin-only. RLS also enforces is_admin()
// for direct-DB deletes, so this endpoint is the audited path.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
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

  let service
  try {
    service = getServiceRoleClient()
  } catch {
    return NextResponse.json({ error: 'Admin service unavailable.' }, { status: 503 })
  }

  const { error } = await service.from('appointments').delete().eq('id', id)
  if (error) {
    console.error('Admin delete failed:', error.message)
    return NextResponse.json({ error: 'Failed to delete appointment.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
