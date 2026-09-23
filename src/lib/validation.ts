import { HEALTH_FACILITIES, LABORATORY_TESTS, APPOINTMENT_STATUSES, ECG_LABEL, ECG_WEEKDAY, type AppointmentStatus } from './types'
import { unavailableDateReason } from './dates/holidays'

export { unavailableDateReason } from './dates/holidays'

const MAX_TESTS = LABORATORY_TESTS.length
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

export interface ValidatedAppointmentInput {
  patient_name: string
  last_name: string
  first_name: string
  middle_name: string
  birthdate: string
  age: number
  contact_number: string
  consultation_facility: string
  yakap_registered: boolean
  yakap_facility: string | null
  selected_tests: string[]
  appointment_date: string // YYYY-MM-DD
}

export function validateAppointmentInput(body: unknown):
  | { ok: true; data: ValidatedAppointmentInput }
  | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!body || typeof body !== 'object') {
    return { ok: false, errors: ['Invalid request body.'] }
  }
  const b = body as Record<string, unknown>

  // Names: last + first required, middle optional. Birthday replaces manual age.
  const clean = (v: unknown) =>
    typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : ''
  const last_name = clean(b.last_name) || clean((b as Record<string, unknown>).lastName)
  const first_name = clean(b.first_name) || clean((b as Record<string, unknown>).firstName)
  const middle_name = clean(b.middle_name) || clean((b as Record<string, unknown>).middleName)
  if (last_name.length < 2 || last_name.length > 50) {
    errors.push('Last name must be 2–50 characters.')
  }
  if (first_name.length < 2 || first_name.length > 50) {
    errors.push('First name must be 2–50 characters.')
  }
  if (middle_name.length > 50) {
    errors.push('Middle name must be 50 characters or less.')
  }

  // Birthdate YYYY-MM-DD, must be a real past date with age 1–120.
  const birthdate = clean(b.birthdate)
  let ageNum = NaN
  if (!DATE_RE.test(birthdate)) {
    errors.push('Birthday must be YYYY-MM-DD.')
  } else {
    const [by, bm, bd] = birthdate.split('-').map(Number)
    const born = new Date(by, bm - 1, bd)
    const pad = (n: number) => String(n).padStart(2, '0')
    const norm =
      !Number.isNaN(born.getTime())
        ? `${born.getFullYear()}-${pad(born.getMonth() + 1)}-${pad(born.getDate())}`
        : ''
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (norm !== birthdate) {
      errors.push('Birthday is not a real calendar date.')
    } else if (born > today) {
      errors.push('Birthday cannot be in the future.')
    } else {
      let age = today.getFullYear() - born.getFullYear()
      const hadBirthday =
        today.getMonth() > born.getMonth() ||
        (today.getMonth() === born.getMonth() && today.getDate() >= born.getDate())
      if (!hadBirthday) age -= 1
      if (age < 1 || age > 120) {
        errors.push('Birthday must give an age between 1 and 120.')
      } else {
        ageNum = age
      }
    }
  }

  // Display name kept for lists/search/CSV: "Last, First Middle".
  let patient_name =
    last_name && first_name
      ? `${last_name}, ${first_name}${middle_name ? ` ${middle_name}` : ''}`
      : ''
  // Old clients still send patient_name + age; accept as fallback.
  if (!patient_name) {
    const rawName = clean(b.patient_name)
    const altName = clean((b as Record<string, unknown>).fullName)
    const legacy = rawName || altName
    if (legacy.length >= 2 && legacy.length <= 100) {
      patient_name = legacy
    } else {
      errors.push('Last name and first name are required.')
    }
    const legacyAge =
      typeof b.age === 'number' ? b.age : typeof b.age === 'string' ? Number(b.age) : NaN
    if (!Number.isInteger(legacyAge) || legacyAge < 1 || legacyAge > 120) {
      errors.push('Age must be a whole number between 1 and 120.')
    } else if (Number.isNaN(ageNum)) {
      ageNum = legacyAge
    }
  }
  if (patient_name.length < 2 || patient_name.length > 100) {
    errors.push('Full name must be 2–100 characters.')
  }

  // contact number, 7-15 digits only
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

  // facility must be in list (healthFacility is old key)
  const rawFacility =
    typeof b.consultation_facility === 'string'
      ? b.consultation_facility.trim()
      : typeof (b as Record<string, unknown>).healthFacility === 'string'
        ? String((b as Record<string, unknown>).healthFacility).trim()
        : ''
  if (!FACILITIES.has(rawFacility)) {
    errors.push('Selected health facility is invalid.')
  }

  // yakap yes/no, old form sends YES/NO string
  let yakap_registered: boolean | null = null
  if (typeof b.yakap_registered === 'boolean') yakap_registered = b.yakap_registered
  else if (typeof (b as Record<string, unknown>).yakapRegistered === 'boolean')
    yakap_registered = Boolean((b as Record<string, unknown>).yakapRegistered)
  else if (b.yakap_registered === 'YES') yakap_registered = true
  else if (b.yakap_registered === 'NO') yakap_registered = false
  if (yakap_registered === null) errors.push('YAKAP registration status is required.')

  // yakap facility required if YES
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

  // at least 1 test, remove duplicates
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

  // date must be today to +180 days, compare local date so no UTC issue
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
    } else if (selected_tests.includes(ECG_LABEL) && parsed.getDay() !== ECG_WEEKDAY) {
      errors.push('ECG is available on Wednesdays only (1:00–4:00 PM). Please choose a Wednesday.')
    } else {
      const reason = unavailableDateReason(rawDate)
      if (reason) errors.push(reason)
    }
  }

  if (errors.length > 0 || yakap_registered === null) {
    return { ok: false, errors: errors.length > 0 ? errors : ['Invalid input.'] }
  }
  return {
    ok: true,
    data: {
      patient_name,
      last_name,
      first_name,
      middle_name,
      birthdate,
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

// Light status state machine. Same-status is always allowed (idempotent).
// The only blocked jump is cancelled -> completed (restore it first).
const STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ['confirmed', 'completed', 'cancelled'],
  confirmed: ['pending', 'completed', 'cancelled'],
  completed: ['confirmed', 'cancelled'],
  cancelled: ['pending', 'confirmed'],
}

export function canTransitionStatus(from: string, to: AppointmentStatus): boolean {
  if (from === to) return true
  const allowed = STATUS_TRANSITIONS[from as AppointmentStatus]
  return Array.isArray(allowed) && allowed.includes(to)
}
