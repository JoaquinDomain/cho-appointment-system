// Self-heal for databases created before the status workflow.
// Those tables lack the `status` column (CREATE TABLE IF NOT EXISTS never
// backfills it), so any query touching `status` fails with either
// "no such column: status" or "table appointments has no column named status".
// Since the app already writes to D1, it can apply the same ALTER TABLE that
// d1/migrate_status.sql contains, then the caller retries its query.
import { d1Query, d1Run } from './d1'

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
      // Column exists (or a different problem) — let the caller handle it.
      return { ok: true }
    }
  }

  console.warn(
    'appointments.status column missing — auto-applying migration. ' +
      'Equivalent manual step: npx wrangler d1 execute cho-appointments --remote --file=./d1/migrate_status.sql'
  )
  try {
    await d1Run(
      `ALTER TABLE appointments ADD COLUMN status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled'))`
    )
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    // Lost a race with another request that just added it — column is there.
    if (/duplicate column/i.test(msg)) return { ok: true }
    console.error('Auto-migration for status column failed:', e)
    return {
      ok: false,
      message:
        'The database needs the status-column migration: npx wrangler d1 execute cho-appointments --remote --file=./d1/migrate_status.sql',
    }
  }
}
