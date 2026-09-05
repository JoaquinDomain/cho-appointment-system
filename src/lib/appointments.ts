import type { Appointment } from './types'

// D1 stores yakap_registered as INTEGER 0/1 and selected_tests as JSON text.
export interface AppointmentRow {
  id: string
  patient_name: string
  age: number
  consultation_facility: string
  yakap_registered: number
  yakap_facility: string | null
  selected_tests: string
  appointment_date: string
  created_at: string
}

export function mapAppointmentRow(row: AppointmentRow): Appointment {
  let tests: string[] = []
  try {
    const parsed: unknown = JSON.parse(row.selected_tests)
    if (Array.isArray(parsed)) tests = parsed.filter((t): t is string => typeof t === 'string')
  } catch {
    tests = []
  }
  return {
    id: row.id,
    patient_name: row.patient_name,
    age: row.age,
    consultation_facility: row.consultation_facility,
    yakap_registered: row.yakap_registered === 1,
    ...(row.yakap_facility ? { yakap_facility: row.yakap_facility } : {}),
    selected_tests: tests,
    appointment_date: row.appointment_date,
    created_at: row.created_at,
  }
}

// LIKE pattern escaping for SQLite (used with ESCAPE '\').
export function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}
