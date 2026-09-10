// Self-heal for databases created before contact-number tracking.
// Same pattern as status-column.ts / source-column.ts: the app can apply
// the same ALTER TABLE that d1/migrate_contact.sql contains, then the
// caller retries its query.
import { d1Query, d1Run } from './d1'

export function isMissingContactColumn(msg: string): boolean {
  return /no\s+(such\s+column|column named)\s*:?\s*contact_number/i.test(msg)
}

export async function ensureContactColumn(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  try {
    await d1Query('SELECT contact_number FROM appointments LIMIT 0')
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (!isMissingContactColumn(msg)) {
      return { ok: true }
    }
  }

  console.warn(
    'appointments.contact_number column missing — auto-applying migration. ' +
      'Equivalent manual step: npx wrangler d1 execute cho-appointments --remote --file=./d1/migrate_contact.sql'
  )
  try {
    await d1Run(
      `ALTER TABLE appointments ADD COLUMN contact_number TEXT NOT NULL DEFAULT '' CHECK (length(contact_number) <= 20)`
    )
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/duplicate column/i.test(msg)) return { ok: true }
    console.error('Auto-migration for contact_number column failed:', e)
    return {
      ok: false,
      message:
        'The database needs the contact-number migration: npx wrangler d1 execute cho-appointments --remote --file=./d1/migrate_contact.sql',
    }
  }
}
