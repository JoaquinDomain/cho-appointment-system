import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/session'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { isRealDate } from '@/lib/validation'
import {
  LABORATORY_TESTS,
  MAX_ONLINE_CAPACITY,
  TEST_CONFIG,
  parseOnlineCapacity,
} from '@/lib/types'
import {
  getCapacitySnapshot,
  getWalkinTestCapacities,
  legacyDefaultWalkinCapacity,
  setTestCapacity,
  todayIso,
} from '@/lib/test-capacities'

// Capacity changes must be visible to the next booking immediately.
export const dynamic = 'force-dynamic'

// Accept the display label ("CBC") or the internal key ("cbc") and always
// store the canonical display label used by appointments.selected_tests.
const LABEL_BY_ALIAS = new Map<string, string>()
for (const [key, config] of Object.entries(TEST_CONFIG)) {
  LABEL_BY_ALIAS.set(key.toLowerCase(), config.label)
  LABEL_BY_ALIAS.set(config.label.toLowerCase(), config.label)
}
function canonicalLabel(value: string): string | null {
  const label = LABEL_BY_ALIAS.get(value.trim().toLowerCase())
  return label && (LABORATORY_TESTS as readonly string[]).includes(label) ? label : null
}

function rateLimited(req: Request): NextResponse | null {
  const rl = checkRateLimit(`capacities-admin:${getClientIp(req)}`, 120, 10 * 60 * 1000)
  return rl.allowed ? null : NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
}

function readDate(value: string | null): string | null {
  if (value === null || value.trim() === '') return todayIso()
  const date = value.trim()
  return isRealDate(date) ? date : null
}

// GET /api/admin/capacities[?date=YYYY-MM-DD]
// Returns the configured online and walk-in capacity, counted appointments and
// remaining slots for every laboratory test on one appointment date.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const limited = rateLimited(req)
  if (limited) return limited

  const { searchParams } = new URL(req.url)
  const date = readDate(searchParams.get('date'))
  if (!date) {
    return NextResponse.json(
      { error: 'Date parameter must be a real calendar date in YYYY-MM-DD form.' },
      { status: 400 }
    )
  }

  try {
    return NextResponse.json(await getCapacitySnapshot(date), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    console.error('Error loading test capacities:', e)
    return NextResponse.json({ error: 'Failed to load test capacities.' }, { status: 500 })
  }
}

// PATCH /api/admin/capacities
// body: { test_label: "CBC", max_online_capacity: 20, max_walkin_capacity: 10 }
// Also accepts { test, capacity } as a convenience. max_walkin_capacity is
// optional; when omitted the saved walk-in capacity is kept. This is the only
// endpoint that changes capacity, and it requires a valid admin session.
export async function PATCH(req: Request) {
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

  const record =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const rawLabel =
    record.test_label ?? record.testLabel ?? record.test ?? record.label
  const rawCapacity =
    record.max_online_capacity ??
    record.maxOnlineCapacity ??
    record.online_capacity ??
    record.capacity ??
    record.max_capacity
  const rawWalkinCapacity =
    record.max_walkin_capacity ??
    record.maxWalkinCapacity ??
    record.walkin_capacity ??
    record.walkinCapacity

  if (typeof rawLabel !== 'string' || rawLabel.trim() === '') {
    return NextResponse.json({ error: 'Test label is required.' }, { status: 400 })
  }
  const label = canonicalLabel(rawLabel)
  if (!label) {
    return NextResponse.json({ error: 'Unknown laboratory test.' }, { status: 400 })
  }

  const capacity = parseOnlineCapacity(rawCapacity)
  if (capacity === null) {
    return NextResponse.json(
      {
        error: `Online capacity must be a whole number from 0 to ${MAX_ONLINE_CAPACITY}.`,
      },
      { status: 400 }
    )
  }

  let walkinCapacity: number | null = null
  if (rawWalkinCapacity !== undefined) {
    walkinCapacity = parseOnlineCapacity(rawWalkinCapacity)
    if (walkinCapacity === null) {
      return NextResponse.json(
        {
          error: `Walk-in capacity must be a whole number from 0 to ${MAX_ONLINE_CAPACITY}.`,
        },
        { status: 400 }
      )
    }
  }

  const dateParam = typeof record.date === 'string' ? record.date.trim() : ''
  if (dateParam && !isRealDate(dateParam)) {
    return NextResponse.json(
      { error: 'Date must be a real calendar date in YYYY-MM-DD form.' },
      { status: 400 }
    )
  }

  try {
    if (walkinCapacity === null) {
      const saved = await getWalkinTestCapacities()
      walkinCapacity = saved[label] ?? legacyDefaultWalkinCapacity(label)
    }
    await setTestCapacity(label, capacity, walkinCapacity, auth.email)
    const date = dateParam || todayIso()
    const snapshot = await getCapacitySnapshot(date)
    return NextResponse.json(
      {
        ok: true,
        success: true,
        date,
        test: snapshot.tests.find((test) => test.label === label),
        capacities: snapshot.capacities,
        walkinCapacities: snapshot.walkinCapacities,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e) {
    console.error('Error updating test capacity:', e)
    return NextResponse.json({ error: 'Failed to update the test capacity.' }, { status: 500 })
  }
}
