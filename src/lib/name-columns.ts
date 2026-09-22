// Old db has no split-name / birthdate columns yet. Same fix, see migrate_names_birthday.sql.
import { d1Query, d1Run } from './db/d1'

const COLUMNS = ['last_name', 'first_name', 'middle_name', 'birthdate'] as const

type NameColumn = (typeof COLUMNS)[number]

export function isMissingNameColumn(msg: string): boolean {
  return COLUMNS.some((c) => new RegExp(`no\\s+(such\\s+column|column named)\\s*:?\\s*${c}`, 'i').test(msg))
}

function alterFor(col: NameColumn): string {
  switch (col) {
    case 'last_name':
      return `ALTER TABLE appointments ADD COLUMN last_name TEXT NOT NULL DEFAULT '' CHECK (length(last_name) <= 50)`
    case 'first_name':
      return `ALTER TABLE appointments ADD COLUMN first_name TEXT NOT NULL DEFAULT '' CHECK (length(first_name) <= 50)`
    case 'middle_name':
      return `ALTER TABLE appointments ADD COLUMN middle_name TEXT NOT NULL DEFAULT '' CHECK (length(middle_name) <= 50)`
    case 'birthdate':
      return `ALTER TABLE appointments ADD COLUMN birthdate TEXT NOT NULL DEFAULT ''`
  }
}

export async function ensureNameColumns(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const missing: NameColumn[] = []
  for (const col of COLUMNS) {
    try {
      await d1Query(`SELECT ${col} FROM appointments LIMIT 0`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (isMissingNameColumn(msg) || /no such column/i.test(msg)) {
        missing.push(col)
      }
    }
  }
  if (missing.length === 0) return { ok: true }

  console.warn(
    `appointments.${missing.join(', ')} column(s) missing - auto-applying migration. ` +
      'Equivalent manual step: npx wrangler d1 execute cho-appointments --remote --file=./d1/migrate_names_birthday.sql'
  )
  try {
    for (const col of missing) {
      try {
        await d1Run(alterFor(col))
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (!/duplicate column/i.test(msg)) throw e
      }
    }
    return { ok: true }
  } catch (e) {
    console.error('Auto-migration for name/birthdate columns failed:', e)
    return {
      ok: false,
      message:
        'The database needs the names-birthday migration: npx wrangler d1 execute cho-appointments --remote --file=./d1/migrate_names_birthday.sql',
    }
  }
}
