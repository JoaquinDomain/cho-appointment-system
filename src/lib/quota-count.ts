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
  source?: unknown
}

// Split counts by booking origin. Rows without a source (pre-migration
// databases, legacy fallback reads) count as online — walk-ins didn't
// exist before the source column, so this is exact, not a guess.
export function countBookedTestsBySource(rows: QuotaRow[]): {
  online: Record<string, number>
  walkin: Record<string, number>
  total: Record<string, number>
} {
  const online: Record<string, number> = {}
  const walkin: Record<string, number> = {}
  const total: Record<string, number> = {}
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
    const bucket =
      typeof row.source === 'string' && row.source.trim().toLowerCase() === 'walkin'
        ? walkin
        : online
    for (const t of tests) {
      if (typeof t !== 'string') continue
      const label = t.trim()
      if (!label) continue
      bucket[label] = (bucket[label] || 0) + 1
      total[label] = (total[label] || 0) + 1
    }
  }
  return { online, walkin, total }
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
