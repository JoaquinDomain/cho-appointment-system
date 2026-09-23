// Old db has no checked_in_at column yet (QR one-time check-in).
import { d1Query, d1Run } from './db/d1'

export function isMissingCheckedInColumn(msg: string): boolean {
  return /no\s+(such\s+column|column named)\s*:?\s*checked_in_at/i.test(msg)
}

export async function ensureCheckedInColumn(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  try {
    await d1Query('SELECT checked_in_at FROM appointments LIMIT 0')
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (!isMissingCheckedInColumn(msg)) {
      return { ok: true }
    }
  }

  console.warn(
    'appointments.checked_in_at column missing - auto-applying migration. ' +
      'Equivalent manual step: npx wrangler d1 execute cho-appointments --remote --file=./d1/migrate_checked_in.sql'
  )
  try {
    await d1Run('ALTER TABLE appointments ADD COLUMN checked_in_at TEXT')
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/duplicate column/i.test(msg)) return { ok: true }
    console.error('Auto-migration for checked_in_at column failed:', e)
    return {
      ok: false,
      message:
        'The database needs the checked_in_at migration: npx wrangler d1 execute cho-appointments --remote --file=./d1/migrate_checked_in.sql',
    }
  }
}
