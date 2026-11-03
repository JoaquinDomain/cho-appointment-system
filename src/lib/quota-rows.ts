// Server-only helper for reading the appointment rows that count against a
// date's capacity. Kept in one place so the public quota endpoint, admin quota
// view and booking check all use exactly the same status/source rules.
import { dbQuery } from './db/mysql'
import { isMissingStatusColumn } from './status-column'
import { isMissingSourceColumn, ensureSourceColumn } from './source-column'
import type { QuotaRow } from './quota-count'

/**
 * Rows for one appointment date. Old databases without status/source columns
 * are healed (or queried with the columns they do have) exactly as before.
 */
export async function fetchQuotaRowsForDate(date: string): Promise<QuotaRow[]> {
  try {
    return await dbQuery<QuotaRow>(
      'SELECT selected_tests, status, source FROM appointments WHERE appointment_date = ?',
      [date]
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (isMissingSourceColumn(msg)) {
      await ensureSourceColumn()
      try {
        return await dbQuery<QuotaRow>(
          'SELECT selected_tests, status, source FROM appointments WHERE appointment_date = ?',
          [date]
        )
      } catch {
        return dbQuery<QuotaRow>(
          'SELECT selected_tests, status FROM appointments WHERE appointment_date = ?',
          [date]
        )
      }
    }
    if (isMissingStatusColumn(msg)) {
      return dbQuery<QuotaRow>(
        'SELECT selected_tests FROM appointments WHERE appointment_date = ?',
        [date]
      )
    }
    throw e
  }
}
