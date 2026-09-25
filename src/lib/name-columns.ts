// Old db has no split-name / birthdate columns yet. Same fix, see mysql/schema.sql.
import { dbQuery, dbRun } from './db/mysql'

const COLUMNS = ['last_name', 'first_name', 'middle_name', 'birthdate'] as const

type NameColumn = (typeof COLUMNS)[number]

export function isMissingNameColumn(msg: string): boolean {
  return COLUMNS.some(
    (c) =>
      // SQLite / D1 message
      new RegExp(`no\\s+(such\\s+column|column named)\\s*:?\\s*${c}`, 'i').test(msg) ||
      // MySQL 8.0 message
      new RegExp(`unknown\\s+column\\s+'${c}'`, 'i').test(msg)
  )
}

function alterFor(col: NameColumn): string {
  switch (col) {
    case 'last_name':
      return `ALTER TABLE appointments ADD COLUMN last_name VARCHAR(50) NOT NULL DEFAULT '' CHECK (CHAR_LENGTH(last_name) <= 50)`
    case 'first_name':
      return `ALTER TABLE appointments ADD COLUMN first_name VARCHAR(50) NOT NULL DEFAULT '' CHECK (CHAR_LENGTH(first_name) <= 50)`
    case 'middle_name':
      return `ALTER TABLE appointments ADD COLUMN middle_name VARCHAR(50) NOT NULL DEFAULT '' CHECK (CHAR_LENGTH(middle_name) <= 50)`
    case 'birthdate':
      return `ALTER TABLE appointments ADD COLUMN birthdate VARCHAR(10) NOT NULL DEFAULT ''`
  }
}

export async function ensureNameColumns(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const missing: NameColumn[] = []
  for (const col of COLUMNS) {
    try {
      await dbQuery(`SELECT ${col} FROM appointments LIMIT 0`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (isMissingNameColumn(msg)) {
        missing.push(col)
      }
    }
  }
  if (missing.length === 0) return { ok: true }

  console.warn(
    `appointments.${missing.join(', ')} column(s) missing - auto-applying migration. ` +
      'Equivalent manual step: mysql < ./mysql/schema.sql'
  )
  try {
    for (const col of missing) {
      try {
        await dbRun(alterFor(col))
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
        'The database needs the names-birthday migration: re-apply ./mysql/schema.sql or run the ALTER TABLE from it.',
    }
  }
}
