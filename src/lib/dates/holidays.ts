// Philippine non-working holidays (lab closed — no appointments).
// Single source of truth for client + server closed-day checks.
//
// 2026 dates per the Malacañang holiday proclamation (regular holidays and
// special non-working days). 25 Feb 2026 (EDSA Anniversary) is a special
// WORKING day, so it is intentionally NOT listed — the lab is open.
// Eid'l Fitr / Eid'l Adha dates are proclaimed separately by the NCMF after
// moon-sighting and are not listed here until announced.
// 2027 lists only fixed-date / Holy-Week-derived days (Easter 2027 = Mar 28);
// the full 2027 proclamation is still pending at the time of writing.

export const PHILIPPINE_HOLIDAYS: Readonly<Record<string, string>> = {
  // ---- 2026: regular holidays ----
  '2026-01-01': "New Year's Day",
  '2026-04-02': 'Maundy Thursday',
  '2026-04-03': 'Good Friday',
  '2026-04-09': 'Araw ng Kagitingan',
  '2026-05-01': 'Labor Day',
  '2026-06-12': 'Independence Day',
  '2026-08-31': 'National Heroes Day',
  '2026-11-30': 'Bonifacio Day',
  '2026-12-25': 'Christmas Day',
  '2026-12-30': 'Rizal Day',
  // ---- 2026: special non-working days ----
  '2026-02-17': 'Chinese New Year',
  '2026-04-04': 'Black Saturday',
  '2026-08-21': 'Ninoy Aquino Day',
  '2026-11-01': "All Saints' Day",
  '2026-11-02': "All Souls' Day",
  '2026-12-08': 'Feast of the Immaculate Conception',
  '2026-12-24': 'Christmas Eve',
  '2026-12-31': 'Last Day of the Year',
  // ---- 2027: fixed-date / Holy-Week-derived (full proclamation pending) ----
  '2027-01-01': "New Year's Day",
  '2027-03-25': 'Maundy Thursday',
  '2027-03-26': 'Good Friday',
  '2027-03-27': 'Black Saturday',
  '2027-04-09': 'Araw ng Kagitingan',
  '2027-06-12': 'Independence Day',
  '2027-08-30': 'National Heroes Day',
  '2027-11-01': "All Saints' Day",
  '2027-11-30': 'Bonifacio Day',
  '2027-12-08': 'Feast of the Immaculate Conception',
  '2027-12-24': 'Christmas Eve',
  '2027-12-25': 'Christmas Day',
  '2027-12-30': 'Rizal Day',
  '2027-12-31': 'Last Day of the Year',
}

export function holidayName(dateStr: string): string | null {
  return PHILIPPINE_HOLIDAYS[dateStr] ?? null
}

export function isWeekend(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return false
  const day = d.getDay() // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6
}

// Returns a human-readable reason, or null if the date is bookable.
export function unavailableDateReason(dateStr: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
  if (isWeekend(dateStr))
    return 'The laboratory is closed on weekends. Please choose a weekday (Monday–Friday).'
  const name = holidayName(dateStr)
  if (name) return `The laboratory is closed on ${name} (${dateStr}). Please choose another day.`
  return null
}
