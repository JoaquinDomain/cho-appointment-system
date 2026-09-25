// Admin-managed closure dates: no new online booking or walk-in on a blocked
// day. Weekends and PH holidays are separate static rules, see
// dates/holidays.ts — those are never stored here. Existing appointments on a
// blocked date are left alone; only new ones are refused.
// Server-only — do not import from client components.
import { dbFirst, dbQuery, dbRun } from './db/mysql'

export const MAX_NOTE_LENGTH = 160

export type BlockedDateInfo = { blocked: true; note: string }

let ensured = false

/** Same DDL as mysql/schema.sql. Runs once per process, on first use. */
export async function ensureBlockedDatesTable(): Promise<void> {
  if (ensured) return
  await dbRun(
    `CREATE TABLE IF NOT EXISTS blocked_dates (
      blocked_date VARCHAR(10) NOT NULL,
      note VARCHAR(160) NOT NULL DEFAULT '',
      created_at VARCHAR(32) NOT NULL,
      created_by VARCHAR(254) NOT NULL DEFAULT '',
      PRIMARY KEY (blocked_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
  )
  ensured = true
}

function isMissingTable(msg: string): boolean {
  return /blocked_dates.*doesn't exist|doesn't exist.*blocked_dates/i.test(msg)
}

// ensure the table, then run the query once more if it was missing
async function withTable<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (!isMissingTable(msg)) throw e
    await ensureBlockedDatesTable()
    return run()
  }
}

type Row = { blocked_date: string; note: string }

/** Every blocked date → note (empty string when the admin left it blank). */
export async function getBlockedDates(): Promise<Map<string, string>> {
  const rows = await withTable(() =>
    dbQuery<Row>('SELECT blocked_date, note FROM blocked_dates ORDER BY blocked_date')
  )
  return new Map(rows.map((r) => [r.blocked_date, r.note || '']))
}

/** null when the date is open, otherwise the note the admin left. */
export async function getDateBlockNote(date: string): Promise<string | null> {
  await ensureBlockedDatesTable()
  const row = await dbFirst<{ note: string }>('SELECT note FROM blocked_dates WHERE blocked_date = ?', [
    date,
  ])
  return row ? row.note || '' : null
}

/** Blocks a date (re-blocking just replaces the note). Returns true if new. */
export async function blockDate(
  date: string,
  note: string,
  email: string
): Promise<{ created: boolean }> {
  await ensureBlockedDatesTable()
  const before = await dbFirst<{ blocked_date: string }>(
    'SELECT blocked_date FROM blocked_dates WHERE blocked_date = ?',
    [date]
  )
  await dbRun(
    `INSERT INTO blocked_dates (blocked_date, note, created_at, created_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE note = VALUES(note), created_at = VALUES(created_at), created_by = VALUES(created_by)`,
    [date, note, new Date().toISOString(), email]
  )
  return { created: !before }
}

/** Removes a block. Returns how many rows were deleted. */
export async function unblockDate(date: string): Promise<number> {
  await ensureBlockedDatesTable()
  return dbRun('DELETE FROM blocked_dates WHERE blocked_date = ?', [date])
}

/** Appointments still on the books for that day (cancelled ones do not count). */
export async function countAppointmentsOn(date: string): Promise<number> {
  const row = await dbFirst<{ c: number }>(
    "SELECT COUNT(*) AS c FROM appointments WHERE appointment_date = ? AND status <> 'cancelled'",
    [date]
  )
  return Number(row?.c ?? 0)
}

/** Blocked dates with their existing-appointment counts, for the admin list. */
export async function listBlockedWithCounts(): Promise<
  Array<{ date: string; note: string; appointments: number }>
> {
  const map = await getBlockedDates()
  const dates = [...map.keys()]
  const counts = new Map<string, number>()
  if (dates.length > 0) {
    const placeholders = dates.map(() => '?').join(', ')
    const rows = await dbQuery<{ appointment_date: string; c: number }>(
      `SELECT appointment_date, COUNT(*) AS c FROM appointments
       WHERE status <> 'cancelled' AND appointment_date IN (${placeholders})
       GROUP BY appointment_date`,
      dates
    )
    for (const r of rows) counts.set(r.appointment_date, Number(r.c))
  }
  return dates.map((date) => ({ date, note: map.get(date) || '', appointments: counts.get(date) ?? 0 }))
}
