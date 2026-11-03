// Admin-managed daily online capacity for every laboratory test.
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
}

export interface CapacityTestSummary {
  label: string
  maxOnlineCapacity: number
  counted: number
  available: number
  walkin: number
  total: number
}

export interface CapacitySnapshot {
  date: string
  tests: CapacityTestSummary[]
  capacities: Record<string, number>
  counts: Record<string, number>
  walkinCounts: Record<string, number>
  totalCounts: Record<string, number>
  available: Record<string, number>
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
      updated_at VARCHAR(32) NOT NULL,
      updated_by VARCHAR(254) NOT NULL DEFAULT '',
      PRIMARY KEY (test_label),
      CONSTRAINT chk_test_capacities_max
        CHECK (max_online_capacity BETWEEN 0 AND ${MAX_ONLINE_CAPACITY})
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
  )

  const placeholders = LABORATORY_TESTS.map(() => '(?, ?, ?, ?)').join(', ')
  const now = new Date().toISOString()
  const params = LABORATORY_TESTS.flatMap((label) => [
    label,
    legacyDefaultOnlineCapacity(label),
    now,
    'system',
  ])
  await dbRun(
    `INSERT IGNORE INTO test_capacities
      (test_label, max_online_capacity, updated_at, updated_by)
     VALUES ${placeholders}`,
    params
  )
  ensured = true
}

/** Saved capacity for every configured test, keyed by test label. */
export async function getTestCapacities(): Promise<Record<string, number>> {
  await ensureTestCapacitiesTable()
  const rows = await dbQuery<TestCapacityRow>(
    'SELECT test_label, max_online_capacity FROM test_capacities'
  )
  const saved = new Map<string, number>()
  for (const row of rows) {
    const value = Number(row.max_online_capacity)
    // Fail closed (0) if a legacy/corrupt row is unreadable rather than
    // silently allowing bookings above an unknown capacity.
    saved.set(
      row.test_label,
      Number.isInteger(value) && value >= 0 && value <= MAX_ONLINE_CAPACITY ? value : 0
    )
  }

  const capacities: Record<string, number> = {}
  for (const label of LABORATORY_TESTS) {
    capacities[label] = saved.get(label) ?? legacyDefaultOnlineCapacity(label)
  }
  return capacities
}

/**
 * Capacity, counted online appointments and availability for one date.
 * Counted follows the existing rules in quota-count.ts: cancelled appointments
 * are excluded, old rows without a status count, and old rows without a source
 * count as online. Walk-ins are tracked separately and do not consume online
 * capacity.
 */
export async function getCapacitySnapshot(date: string): Promise<CapacitySnapshot> {
  const capacities = await getTestCapacities()
  const rows = await fetchQuotaRowsForDate(date)
  const split = countBookedTestsBySource(rows)

  const tests: CapacityTestSummary[] = LABORATORY_TESTS.map((label) => {
    const maxOnlineCapacity = capacities[label] ?? 0
    const counted = split.online[label] ?? 0
    return {
      label,
      maxOnlineCapacity,
      counted,
      available: Math.max(0, maxOnlineCapacity - counted),
      walkin: split.walkin[label] ?? 0,
      total: split.total[label] ?? 0,
    }
  })

  const available: Record<string, number> = {}
  for (const test of tests) available[test.label] = test.available

  return {
    date,
    tests,
    capacities,
    counts: split.online,
    walkinCounts: split.walkin,
    totalCounts: split.total,
    available,
  }
}

/** Persist one test's capacity. The caller must have validated the value. */
export async function setTestCapacity(
  label: string,
  capacity: number,
  email: string
): Promise<void> {
  await ensureTestCapacitiesTable()
  await dbRun(
    `INSERT INTO test_capacities
      (test_label, max_online_capacity, updated_at, updated_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       max_online_capacity = VALUES(max_online_capacity),
       updated_at = VALUES(updated_at),
       updated_by = VALUES(updated_by)`,
    [label, capacity, new Date().toISOString(), email]
  )
}
