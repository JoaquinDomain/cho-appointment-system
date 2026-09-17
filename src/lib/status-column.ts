// Old db has no status column yet. Add it here so old installs still work,
// same as d1/migrate_status.sql.
import { d1Query, d1Run } from './db/d1'

export function isMissingStatusColumn(msg: string): boolean {
  return /no\s+(such\s+column|column named)\s*:?\s*status/i.test(msg)
}

export async function ensureStatusColumn(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  try {
    await d1Query('SELECT status FROM appointments LIMIT 0')
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
      'Equivalent manual step: npx wrangler d1 execute cho-appointments --remote --file=./d1/migrate_status.sql'
  )
  try {
    await d1Run(
      `ALTER TABLE appointments ADD COLUMN status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled'))`
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
        'The database needs the status-column migration: npx wrangler d1 execute cho-appointments --remote --file=./d1/migrate_status.sql',
    }
  }
}
