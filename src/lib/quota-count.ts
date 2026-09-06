// Shared quota counting used by the public quotas API, the booking
// quota-check, and (indirectly) every UI that displays booked counts.
// Rules, applied identically everywhere:
// - Counts are per appointment_date (callers filter by date in SQL).
// - Cancelled appointments free their slot and are NOT counted.
// - Rows without a status (pre-migration databases) are counted.
// - Labels are trimmed so stray whitespace can never split a test's count.
export interface QuotaRow {
  selected_tests: string
  status?: unknown
}

export function countBookedTests(rows: QuotaRow[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    if (typeof row.status === 'string' && row.status.trim().toLowerCase() === 'cancelled') {
      continue
    }
    let tests: unknown
    try {
      tests = JSON.parse(row.selected_tests)
    } catch {
      continue // Ignore malformed rows when counting.
    }
    if (!Array.isArray(tests)) continue
    for (const t of tests) {
      if (typeof t !== 'string') continue
      const label = t.trim()
      if (!label) continue
      counts[label] = (counts[label] || 0) + 1
    }
  }
  return counts
}
