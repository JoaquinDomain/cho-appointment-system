// Old db has no source column yet. Same fix as status, see mysql/schema.sql.
import { dbQuery, dbRun } from './db/mysql'

export function isMissingSourceColumn(msg: string): boolean {
  return (
    /no\s+(such\s+column|column named)\s*:?\s*source/i.test(msg) ||
    // MySQL 8.0: "Unknown column 'source' in 'field list'"
    /unknown\s+column\s+'source'/i.test(msg)
  )
}

export async function ensureSourceColumn(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  try {
    await dbQuery('SELECT source FROM appointments LIMIT 0')
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (!isMissingSourceColumn(msg)) {
      return { ok: true }
    }
  }

  console.warn(
    'appointments.source column missing - auto-applying migration. ' +
      'Equivalent manual step: mysql < ./mysql/schema.sql'
  )
  try {
    await dbRun(
      `ALTER TABLE appointments ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'online' CHECK (source IN ('online','walkin'))`
    )
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/duplicate column/i.test(msg)) return { ok: true }
    console.error('Auto-migration for source column failed:', e)
    return {
      ok: false,
      message:
        'The database needs the source-column migration: re-apply ./mysql/schema.sql or run the ALTER TABLE from it.',
    }
  }
}
