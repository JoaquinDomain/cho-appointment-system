// Counting for quotas, used by quotas api and booking check.
// Rules:
// - per date only (caller filters in SQL)
// - cancelled is not counted, slot is free again
// - old rows with no status are counted
// - trim labels so spaces do not split count
export interface QuotaRow {
  selected_tests: string
  status?: unknown
  source?: unknown
}

// Split online vs walkin. Old rows with no source count as online
// since walkin did not exist before the source column.
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
      continue // skip bad rows
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
