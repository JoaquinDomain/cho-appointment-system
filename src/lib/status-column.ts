// Old db has no status column yet. Add it here so old installs still work,
// same as mysql/schema.sql.
import { dbQuery, dbRun } from './db/mysql'

export function isMissingStatusColumn(msg: string): boolean {
  return (
    // SQLite / D1 message (kept so a mixed deployment still heals)
    /no\s+(such\s+column|column named)\s*:?\s*status/i.test(msg) ||
    // MySQL 8.0: "Unknown column 'status' in 'field list'"
    /unknown\s+column\s+'status'/i.test(msg)
  )
}

export async function ensureStatusColumn(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  try {
    await dbQuery('SELECT status FROM appointments LIMIT 0')
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (!isMissingStatusColumn(msg)) {
      // not a missing column issue, let caller handle
      return { ok: true }
    }
  }

  console.warn(
    'appointments.status column missing - auto-applying migration. ' +
      'Equivalent manual step: mysql < ./mysql/schema.sql'
  )
  try {
    await dbRun(
      `ALTER TABLE appointments ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled'))`
    )
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    // another request may have added it already, just continue
    if (/duplicate column/i.test(msg)) return { ok: true }
    console.error('Auto-migration for status column failed:', e)
    return {
      ok: false,
      message:
        'The database needs the status-column migration: re-apply ./mysql/schema.sql or run the ALTER TABLE from it.',
    }
  }
}
