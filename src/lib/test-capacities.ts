// Admin-managed daily online and walk-in capacity for every laboratory test.
// Server-only: the browser gets capacity numbers through the public quota API
// and never talks to MySQL directly.
import { dbQuery, dbRun } from './db/mysql'
import { countBookedTestsBySource } from './quota-count'
import { fetchQuotaRowsForDate } from './quota-rows'
import {
  LABORATORY_TESTS,
  MAX_ONLINE_CAPACITY,
  TEST_CONFIG,
  onlineLimitForTest,
} from './types'

export interface TestCapacityRow {
  test_label: string
  max_online_capacity: number | string
  max_walkin_capacity: number | string
}

export interface CapacityTestSummary {
  label: string
  maxOnlineCapacity: number
  maxWalkinCapacity: number
  counted: number
  available: number
  walkin: number
  walkinAvailable: number
  total: number
}

export interface CapacitySnapshot {
  date: string
  tests: CapacityTestSummary[]
  capacities: Record<string, number>
  walkinCapacities: Record<string, number>
  counts: Record<string, number>
  walkinCounts: Record<string, number>
  totalCounts: Record<string, number>
  available: Record<string, number>
  walkinAvailable: Record<string, number>
}

interface TestCapacityValues {
  online: Record<string, number>
  walkin: Record<string, number>
}

let ensured = false

/**
 * The previous online share is used only to seed a test that does not have a
 * saved capacity yet. Once the row exists, MySQL is the sole source of truth.
 */
export function legacyDefaultOnlineCapacity(label: string): number {
  const config = Object.values(TEST_CONFIG).find((t) => t.label === label)
  return config ? onlineLimitForTest(config.limit, label) : 0
}

/**
 * The previous walk-in share (the held-back half of the old hardcoded limit)
 * is used only to seed tests that have no saved walk-in capacity yet.
 */
export function legacyDefaultWalkinCapacity(label: string): number {
  const config = Object.values(TEST_CONFIG).find((t) => t.label === label)
  if (!config) return 0
  return Math.max(0, config.limit - onlineLimitForTest(config.limit, label))
}

function storedCapacity(value: unknown): number {
  const parsed = Number(value)
  // Fail closed (0) if a legacy/corrupt row is unreadable rather than
  // silently allowing bookings above an unknown capacity.
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_ONLINE_CAPACITY
    ? parsed
    : 0
}

function isMissingWalkinCapacityColumn(msg: string): boolean {
  return (
    /unknown\s+column\s+'max_walkin_capacity'/i.test(msg) ||
    /no\s+(such\s+column|column named)\s*:?\s*max_walkin_capacity/i.test(msg)
  )
}

/** Adds the walk-in column to databases created before this feature. */
async function ensureWalkinCapacityColumn(): Promise<void> {
  try {
    await dbQuery('SELECT max_walkin_capacity FROM test_capacities LIMIT 0')
    return
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (!isMissingWalkinCapacityColumn(msg)) throw e
  }

  console.warn(
    'test_capacities.max_walkin_capacity column missing - auto-applying migration. ' +
      'Equivalent manual step: mysql < ./mysql/migrate_test_capacities.sql'
  )
  try {
    await dbRun(
      'ALTER TABLE test_capacities ADD COLUMN max_walkin_capacity INT UNSIGNED NOT NULL DEFAULT 0 AFTER max_online_capacity'
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (!/duplicate column/i.test(msg)) throw e
  }

  // Existing rows predate the column, so seed the previous walk-in share.
  for (const label of LABORATORY_TESTS) {
    await dbRun(
      'UPDATE test_capacities SET max_walkin_capacity = ? WHERE test_label = ?',
      [legacyDefaultWalkinCapacity(label), label]
    )
  }
}

/** Local calendar date, matching the date picker on the admin/patient UI. */
export function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Creates the table and inserts defaults for any tests that lack a row. */
export async function ensureTestCapacitiesTable(): Promise<void> {
  if (ensured) return
  await dbRun(
    `CREATE TABLE IF NOT EXISTS test_capacities (
      test_label VARCHAR(120) NOT NULL,
      max_online_capacity INT UNSIGNED NOT NULL,
      max_walkin_capacity INT UNSIGNED NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      updated_by VARCHAR(254) NOT NULL DEFAULT '',
      PRIMARY KEY (test_label),
      CONSTRAINT chk_test_capacities_max
        CHECK (max_online_capacity BETWEEN 0 AND ${MAX_ONLINE_CAPACITY}),
      CONSTRAINT chk_test_capacities_walkin
        CHECK (max_walkin_capacity BETWEEN 0 AND ${MAX_ONLINE_CAPACITY})
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
  )

  await ensureWalkinCapacityColumn()

  const placeholders = LABORATORY_TESTS.map(() => '(?, ?, ?, ?, ?)').join(', ')
  const now = new Date().toISOString()
  const params = LABORATORY_TESTS.flatMap((label) => [
    label,
    legacyDefaultOnlineCapacity(label),
    legacyDefaultWalkinCapacity(label),
    now,
    'system',
  ])
  await dbRun(
    `INSERT IGNORE INTO test_capacities
      (test_label, max_online_capacity, max_walkin_capacity, updated_at, updated_by)
     VALUES ${placeholders}`,
    params
  )
  ensured = true
}

/** Saved online and walk-in capacity for every configured test. */
async function getTestCapacityValues(): Promise<TestCapacityValues> {
  await ensureTestCapacitiesTable()
  const rows = await dbQuery<TestCapacityRow>(
    'SELECT test_label, max_online_capacity, max_walkin_capacity FROM test_capacities'
  )
  const online = new Map<string, number>()
  const walkin = new Map<string, number>()
  for (const row of rows) {
    online.set(row.test_label, storedCapacity(row.max_online_capacity))
    walkin.set(row.test_label, storedCapacity(row.max_walkin_capacity))
  }

  const values: TestCapacityValues = { online: {}, walkin: {} }
  for (const label of LABORATORY_TESTS) {
    values.online[label] = online.get(label) ?? legacyDefaultOnlineCapacity(label)
    values.walkin[label] = walkin.get(label) ?? legacyDefaultWalkinCapacity(label)
  }
  return values
}

/** Saved online capacity for every configured test, keyed by test label. */
export async function getTestCapacities(): Promise<Record<string, number>> {
  return (await getTestCapacityValues()).online
}

/** Saved walk-in capacity for every configured test, keyed by test label. */
export async function getWalkinTestCapacities(): Promise<Record<string, number>> {
  return (await getTestCapacityValues()).walkin
}

/**
 * Capacity, counted online appointments and availability for one date.
 * Counted follows the existing rules in quota-count.ts: cancelled appointments
 * are excluded, old rows without a status count, and old rows without a source
 * count as online. Walk-ins are tracked separately and do not consume online
 * capacity.
 */
export async function getCapacitySnapshot(date: string): Promise<CapacitySnapshot> {
  const { online: capacities, walkin: walkinCapacities } =
    await getTestCapacityValues()
  const rows = await fetchQuotaRowsForDate(date)
  const split = countBookedTestsBySource(rows)

  const tests: CapacityTestSummary[] = LABORATORY_TESTS.map((label) => {
    const maxOnlineCapacity = capacities[label] ?? 0
    const maxWalkinCapacity = walkinCapacities[label] ?? 0
    const counted = split.online[label] ?? 0
    const walkin = split.walkin[label] ?? 0
    return {
      label,
      maxOnlineCapacity,
      maxWalkinCapacity,
      counted,
      available: Math.max(0, maxOnlineCapacity - counted),
      walkin,
      walkinAvailable: Math.max(0, maxWalkinCapacity - walkin),
      total: split.total[label] ?? 0,
    }
  })

  const available: Record<string, number> = {}
  const walkinAvailable: Record<string, number> = {}
  for (const test of tests) {
    available[test.label] = test.available
    walkinAvailable[test.label] = test.walkinAvailable
  }

  return {
    date,
    tests,
    capacities,
    walkinCapacities,
    counts: split.online,
    walkinCounts: split.walkin,
    totalCounts: split.total,
    available,
    walkinAvailable,
  }
}

/**
 * Persist one test's online and walk-in capacity.
 * The caller must have validated both values.
 */
export async function setTestCapacity(
  label: string,
  capacity: number,
  walkinCapacity: number,
  email: string
): Promise<void> {
  await ensureTestCapacitiesTable()
  await dbRun(
    `INSERT INTO test_capacities
      (test_label, max_online_capacity, max_walkin_capacity, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       max_online_capacity = VALUES(max_online_capacity),
       max_walkin_capacity = VALUES(max_walkin_capacity),
       updated_at = VALUES(updated_at),
       updated_by = VALUES(updated_by)`,
    [label, capacity, walkinCapacity, new Date().toISOString(), email]
  )
}
