import { HEALTH_FACILITIES, LABORATORY_TESTS, APPOINTMENT_STATUSES, type AppointmentStatus } from './types'

const MAX_TESTS = LABORATORY_TESTS.length

export interface ValidatedAppointmentInput {
  patient_name: string
  age: number
  contact_number: string
  consultation_facility: string
  yakap_registered: boolean
  yakap_facility: string | null
  selected_tests: string[]
  appointment_date: string // YYYY-MM-DD
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const FACILITIES = new Set<string>(HEALTH_FACILITIES as readonly string[])
const TESTS = new Set<string>(LABORATORY_TESTS as readonly string[])
const MAX_FUTURE_DAYS = 180

function toLocalDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function validateAppointmentInput(body: unknown): {
  ok: true
  data: ValidatedAppointmentInput
} | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!body || typeof body !== 'object') {
    return { ok: false, errors: ['Invalid request body.'] }
  }
  const b = body as Record<string, unknown>

  // patient_name: trim, 2–100 chars
  const rawName = typeof b.patient_name === 'string' ? b.patient_name.trim().replace(/\s+/g, ' ') : ''
  // Also accept legacy fullName key from older clients
  const altName =
    typeof (b as Record<string, unknown>).fullName === 'string'
      ? String((b as Record<string, unknown>).fullName).trim().replace(/\s+/g, ' ')
      : ''
  const patient_name = rawName || altName
  if (patient_name.length < 2 || patient_name.length > 100) {
    errors.push('Full name must be 2–100 characters.')
  }

  // age: int 1–120 (accept string or number)
  const ageNum =
    typeof b.age === 'number' ? b.age : typeof b.age === 'string' ? Number(b.age) : NaN
  if (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120) {
    errors.push('Age must be a whole number between 1 and 120.')
  }

  // contact_number: required, 7–15 digits (allows +, spaces, dashes, parens)
  const rawContact =
    typeof b.contact_number === 'string'
      ? b.contact_number.trim()
      : typeof (b as Record<string, unknown>).contactNumber === 'string'
        ? String((b as Record<string, unknown>).contactNumber).trim()
        : ''
  const contactDigits = rawContact.replace(/\D/g, '')
  if (
    rawContact.length === 0 ||
    rawContact.length > 20 ||
    !/^[+()\-\s\d]+$/.test(rawContact) ||
    contactDigits.length < 7 ||
    contactDigits.length > 15
  ) {
    errors.push('Contact number must be 7–15 digits.')
  }

  // consultation_facility: must be in allowlist (accept legacy healthFacility key)
  const rawFacility =
    typeof b.consultation_facility === 'string'
      ? b.consultation_facility.trim()
      : typeof (b as Record<string, unknown>).healthFacility === 'string'
        ? String((b as Record<string, unknown>).healthFacility).trim()
        : ''
  if (!FACILITIES.has(rawFacility)) {
    errors.push('Selected health facility is invalid.')
  }

  // yakap_registered: boolean (accept 'YES'/'NO' legacy strings)
  let yakap_registered: boolean | null = null
  if (typeof b.yakap_registered === 'boolean') yakap_registered = b.yakap_registered
  else if (typeof (b as Record<string, unknown>).yakapRegistered === 'boolean')
    yakap_registered = Boolean((b as Record<string, unknown>).yakapRegistered)
  else if (b.yakap_registered === 'YES') yakap_registered = true
  else if (b.yakap_registered === 'NO') yakap_registered = false
  if (yakap_registered === null) errors.push('YAKAP registration status is required.')

  // yakap_facility: required iff registered, must be in allowlist; else null
  const rawYakap =
    typeof b.yakap_facility === 'string'
      ? b.yakap_facility.trim()
      : typeof (b as Record<string, unknown>).yakapFacility === 'string'
        ? String((b as Record<string, unknown>).yakapFacility).trim()
        : ''
  let yakap_facility: string | null = null
  if (yakap_registered === true) {
    if (!FACILITIES.has(rawYakap)) errors.push('YAKAP facility is required and must be valid.')
    else yakap_facility = rawYakap
  }

  // selected_tests: 1–17 items, each in allowlist, deduped
  const rawTests = Array.isArray(b.selected_tests)
    ? b.selected_tests
    : Array.isArray((b as Record<string, unknown>).selectedTests)
      ? (b as Record<string, unknown>).selectedTests
      : null
  let selected_tests: string[] = []
  if (!Array.isArray(rawTests) || rawTests.length === 0) {
    errors.push('Select at least one laboratory test.')
  } else {
    const cleaned = [...new Set(rawTests.filter((t): t is string => typeof t === 'string').map((t) => t.trim()))]
    const invalid = cleaned.filter((t) => !TESTS.has(t))
    if (invalid.length > 0) errors.push(`Invalid test selection: ${invalid.slice(0, 3).join(', ')}`)
    if (cleaned.length < 1 || cleaned.length > MAX_TESTS)
      errors.push(`Select between 1 and ${MAX_TESTS} laboratory tests.`)
    selected_tests = cleaned.filter((t) => TESTS.has(t))
  }

  // appointment_date: YYYY-MM-DD, today..today+180 (local-day comparison avoids UTC off-by-one)
  const rawDate =
    typeof b.appointment_date === 'string'
      ? b.appointment_date.trim()
      : typeof (b as Record<string, unknown>).appointmentDate === 'string'
        ? String((b as Record<string, unknown>).appointmentDate).trim()
        : ''
  if (!DATE_RE.test(rawDate)) {
    errors.push('Appointment date must be YYYY-MM-DD.')
  } else {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const max = new Date(today)
    max.setDate(max.getDate() + MAX_FUTURE_DAYS)
    const [y, m, d] = rawDate.split('-').map(Number)
    const parsed = new Date(y, m - 1, d)
    if (Number.isNaN(parsed.getTime()) || toLocalDay(parsed) !== rawDate) {
      errors.push('Appointment date is not a real calendar date.')
    } else if (parsed < today) {
      errors.push('Appointment date cannot be in the past.')
    } else if (parsed > max) {
      errors.push(`Appointment date cannot be more than ${MAX_FUTURE_DAYS} days out.`)
    }
  }

  if (errors.length > 0 || yakap_registered === null) {
    return { ok: false, errors: errors.length > 0 ? errors : ['Invalid input.'] }
  }
  return {
    ok: true,
    data: {
      patient_name,
      age: ageNum as number,
      contact_number: rawContact,
      consultation_facility: rawFacility,
      yakap_registered,
      yakap_facility,
      selected_tests,
      appointment_date: rawDate,
    },
  }
}

export function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

export function isValidStatus(value: unknown): value is AppointmentStatus {
  return typeof value === 'string' && (APPOINTMENT_STATUSES as readonly string[]).includes(value)
}
