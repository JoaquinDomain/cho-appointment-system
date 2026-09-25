import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/session'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import {
  MAX_NOTE_LENGTH,
  blockDate,
  countAppointmentsOn,
  getDateBlockNote,
  listBlockedWithCounts,
  unblockDate,
} from '@/lib/blocked-dates'

// blocked dates change rarely and gate bookings — do not cache
export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type DateResult = { ok: true; date: string } | { ok: false; error: string }

function parseDate(value: unknown): DateResult {
  if (typeof value !== 'string' || !DATE_RE.test(value.trim())) {
    return { ok: false, error: 'Date must be in YYYY-MM-DD format.' }
  }
  const date = value.trim()
  const [y, m, d] = date.split('-').map(Number)
  const parsed = new Date(y, m - 1, d)
  if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) {
    return { ok: false, error: 'Date is not a real calendar date.' }
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (parsed < today) {
    return { ok: false, error: 'A date in the past cannot be blocked.' }
  }
  return { ok: true, date }
}

function parseNote(value: unknown): { ok: true; note: string } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, note: '' }
  if (typeof value !== 'string') return { ok: false, error: 'Note must be text.' }
  const note = value.trim()
  if (note.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: `Note must be at most ${MAX_NOTE_LENGTH} characters.` }
  }
  return { ok: true, note }
}

function rateLimited(req: Request): NextResponse | null {
  const rl = checkRateLimit(`blocked-dates-admin:${getClientIp(req)}`, 120, 10 * 60 * 1000)
  return rl.allowed ? null : NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
}

// GET /api/admin/blocked-dates
//   → { blocked: [{ date, note, appointments }] }
// GET /api/admin/blocked-dates?date=YYYY-MM-DD
//   → { date, blocked, note, appointments } for one candidate date
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const limited = rateLimited(req)
  if (limited) return limited

  const { searchParams } = new URL(req.url)
  const dateParam = searchParams.get('date')
  try {
    if (dateParam !== null) {
      const parsed = parseDate(dateParam)
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
      const note = await getDateBlockNote(parsed.date)
      const appointments = await countAppointmentsOn(parsed.date)
      return NextResponse.json({
        date: parsed.date,
        blocked: note !== null,
        note: note ?? '',
        appointments,
      })
    }
    return NextResponse.json({ blocked: await listBlockedWithCounts() })
  } catch (e) {
    console.error('Error listing blocked dates:', e)
    return NextResponse.json({ error: 'Failed to load blocked dates.' }, { status: 500 })
  }
}

// POST /api/admin/blocked-dates, body { date, note? }. Idempotent: re-blocking
// a date just replaces its note. Existing appointments are never changed.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const limited = rateLimited(req)
  if (limited) return limited

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const record = (body ?? {}) as Record<string, unknown>
  const date = parseDate(record.date)
  if (!date.ok) return NextResponse.json({ error: date.error }, { status: 400 })
  const note = parseNote(record.note)
  if (!note.ok) return NextResponse.json({ error: note.error }, { status: 400 })

  try {
    const { created } = await blockDate(date.date, note.note, auth.email)
    return NextResponse.json({
      ok: true,
      date: date.date,
      created,
      appointments: await countAppointmentsOn(date.date),
    })
  } catch (e) {
    console.error('Blocking date failed:', e)
    return NextResponse.json({ error: 'Failed to block the date.' }, { status: 500 })
  }
}

// DELETE /api/admin/blocked-dates, body { date }
export async function DELETE(req: Request) {
  const auth = await requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const limited = rateLimited(req)
  if (limited) return limited

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const record = (body ?? {}) as Record<string, unknown>
  const date = parseDate(record.date)
  if (!date.ok) return NextResponse.json({ error: date.error }, { status: 400 })

  try {
    const removed = await unblockDate(date.date)
    return NextResponse.json({ ok: true, date: date.date, removed })
  } catch (e) {
    console.error('Unblocking date failed:', e)
    return NextResponse.json({ error: 'Failed to unblock the date.' }, { status: 500 })
  }
}
