import type { Appointment, AppointmentStatus } from './types'
import { APPOINTMENT_STATUSES } from './types'

// MySQL stores yakap as 0/1 and tests as a JSON string.
export interface AppointmentRow {
  id: string
  patient_name: string
  last_name?: string | null
  first_name?: string | null
  middle_name?: string | null
  birthdate?: string | null
  age: number
  contact_number?: string | null
  consultation_facility: string
  yakap_registered: number
  yakap_facility: string | null
  selected_tests: string
  appointment_date: string
  status?: string | null
  checked_in_at?: string | null
  created_at: string
}

export function formatPatientName(last: string, first: string, middle: string): string {
  const l = last.trim().replace(/\s+/g, ' ')
  const f = first.trim().replace(/\s+/g, ' ')
  const m = middle.trim().replace(/\s+/g, ' ')
  return `${l}, ${f}${m ? ` ${m}` : ''}`
}

// Full years between birthdate (YYYY-MM-DD) and today. -1 if invalid/future.
export function computeAge(birthdate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return -1
  const [y, m, d] = birthdate.split('-').map(Number)
  const born = new Date(y, m - 1, d)
  if (Number.isNaN(born.getTime())) return -1
  const pad = (n: number) => String(n).padStart(2, '0')
  const norm = `${born.getFullYear()}-${pad(born.getMonth() + 1)}-${pad(born.getDate())}`
  if (norm !== birthdate) return -1
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (born > today) return -1
  let age = today.getFullYear() - born.getFullYear()
  const hadBirthday =
    today.getMonth() > born.getMonth() ||
    (today.getMonth() === born.getMonth() && today.getDate() >= born.getDate())
  if (!hadBirthday) age -= 1
  return age
}

export function mapAppointmentRow(row: AppointmentRow): Appointment {
  let tests: string[] = []
  try {
    const parsed: unknown = JSON.parse(row.selected_tests)
    if (Array.isArray(parsed)) tests = parsed.filter((t): t is string => typeof t === 'string')
  } catch {
    tests = []
  }
  const last = row.last_name ?? ''
  const first = row.first_name ?? ''
  const middle = row.middle_name ?? ''
  const birthdate = row.birthdate ?? ''
  // Old rows have no split names yet, fall back to the stored display name.
  const patient_name =
    row.patient_name ||
    (last || first ? formatPatientName(last || '—', first || '—', middle) : '')
  return {
    id: row.id,
    patient_name,
    last_name: last,
    first_name: first,
    middle_name: middle,
    birthdate,
    age: row.age,
    contact_number: row.contact_number ?? '',
    consultation_facility: row.consultation_facility,
    yakap_registered: row.yakap_registered === 1,
    ...(row.yakap_facility ? { yakap_facility: row.yakap_facility } : {}),
    selected_tests: tests,
    appointment_date: row.appointment_date,
    status: (APPOINTMENT_STATUSES as readonly string[]).includes(row.status ?? '')
      ? (row.status as AppointmentStatus)
      : 'pending',
    checked_in_at: row.checked_in_at ?? null,
    created_at: row.created_at,
  }
}

// for LIKE search in MySQL. '!' is the escape char (see ESCAPE '!' in the
// admin list query): it avoids backslash handling differences between SQL
// modes, so user input can never change the shape of the pattern.
export function escapeLike(value: string): string {
  return value.replace(/[!%_]/g, (c) => `!${c}`)
}
