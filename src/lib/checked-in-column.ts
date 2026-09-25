// Old db has no checked_in_at column yet (QR one-time check-in).
import { dbQuery, dbRun } from './db/mysql'

export function isMissingCheckedInColumn(msg: string): boolean {
  return (
    /no\s+(such\s+column|column named)\s*:?\s*checked_in_at/i.test(msg) ||
    // MySQL 8.0: "Unknown column 'checked_in_at' in 'field list'"
    /unknown\s+column\s+'checked_in_at'/i.test(msg)
  )
}

export async function ensureCheckedInColumn(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  try {
    await dbQuery('SELECT checked_in_at FROM appointments LIMIT 0')
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (!isMissingCheckedInColumn(msg)) {
      return { ok: true }
    }
  }

  console.warn(
    'appointments.checked_in_at column missing - auto-applying migration. ' +
      'Equivalent manual step: mysql < ./mysql/schema.sql'
  )
  try {
    await dbRun('ALTER TABLE appointments ADD COLUMN checked_in_at VARCHAR(32) NULL DEFAULT NULL')
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/duplicate column/i.test(msg)) return { ok: true }
    console.error('Auto-migration for checked_in_at column failed:', e)
    return {
      ok: false,
      message:
        'The database needs the checked_in_at migration: re-apply ./mysql/schema.sql or run the ALTER TABLE from it.',
    }
  }
}
