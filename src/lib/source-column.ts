// Self-heal for databases created before walk-in tracking.
// Those tables lack the `source` column — same pattern as status-column.ts:
// the app can apply the same ALTER TABLE that d1/migrate_source.sql
// contains, then the caller retries its query.
import { d1Query, d1Run } from './d1'

export function isMissingSourceColumn(msg: string): boolean {
  return /no\s+(such\s+column|column named)\s*:?\s*source/i.test(msg)
}

export async function ensureSourceColumn(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  try {
    await d1Query('SELECT source FROM appointments LIMIT 0')
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (!isMissingSourceColumn(msg)) {
      return { ok: true }
    }
  }

  console.warn(
    'appointments.source column missing — auto-applying migration. ' +
      'Equivalent manual step: npx wrangler d1 execute cho-appointments --remote --file=./d1/migrate_source.sql'
  )
  try {
    await d1Run(
      `ALTER TABLE appointments ADD COLUMN source TEXT NOT NULL DEFAULT 'online' CHECK (source IN ('online','walkin'))`
    )
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/duplicate column/i.test(msg)) return { ok: true }
    console.error('Auto-migration for source column failed:', e)
    return {
      ok: false,
      message:
        'The database needs the source-column migration: npx wrangler d1 execute cho-appointments --remote --file=./d1/migrate_source.sql',
    }
  }
}
