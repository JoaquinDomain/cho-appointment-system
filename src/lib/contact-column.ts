// Old db has no contact_number yet. Same fix, see mysql/schema.sql.
import { dbQuery, dbRun } from './db/mysql'

export function isMissingContactColumn(msg: string): boolean {
  return (
    /no\s+(such\s+column|column named)\s*:?\s*contact_number/i.test(msg) ||
    // MySQL 8.0: "Unknown column 'contact_number' in 'field list'"
    /unknown\s+column\s+'contact_number'/i.test(msg)
  )
}

export async function ensureContactColumn(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  try {
    await dbQuery('SELECT contact_number FROM appointments LIMIT 0')
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (!isMissingContactColumn(msg)) {
      return { ok: true }
    }
  }

  console.warn(
    'appointments.contact_number column missing - auto-applying migration. ' +
      'Equivalent manual step: mysql < ./mysql/schema.sql'
  )
  try {
    await dbRun(
      `ALTER TABLE appointments ADD COLUMN contact_number VARCHAR(20) NOT NULL DEFAULT '' CHECK (CHAR_LENGTH(contact_number) <= 20)`
    )
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/duplicate column/i.test(msg)) return { ok: true }
    console.error('Auto-migration for contact_number column failed:', e)
    return {
      ok: false,
      message:
        'The database needs the contact-number migration: re-apply ./mysql/schema.sql or run the ALTER TABLE from it.',
    }
  }
}
