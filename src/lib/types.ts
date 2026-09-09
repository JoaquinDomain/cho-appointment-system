export const APPOINTMENT_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'] as const

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

export interface Appointment {
  id: string
  patient_name: string
  age: number
  consultation_facility: string
  yakap_registered: boolean
  yakap_facility?: string
  selected_tests: string[]
  appointment_date: string
  status: AppointmentStatus
  created_at: string
}

export const HEALTH_FACILITIES = [
  'CHO Main / Bacolod City Health Office',
  'Senior Citizen Center',
  'Alijis Health Station',
  'Banago Health Station',
  'Bata Health Station',
  'Bacolod City Mental Care Center',
  'Singcang Health Station',
  'Handumanan Health Station',
  'Pahanocoy Health Station',
  'Villamonte Health Station',
  'Taculing Health Station',
  'Others'
] as const

export const TEST_CONFIG = {
  cbc: { label: 'CBC', limit: 100, requiresFasting: false },
  chest_xray: { label: 'Chest X-Ray', limit: 100, requiresFasting: false },
  fbs: { label: 'Glucose (FBS)', limit: 50, requiresFasting: true },
  ogtt: { label: 'OGTT', limit: 1, requiresFasting: true },
  lipid_profile: { label: 'Lipid Profile', limit: 50, requiresFasting: true },
  creatinine: { label: 'Creatinine (CREA)', limit: 50, requiresFasting: false },
  uric_acid: { label: 'Uric Acid (URIC)', limit: 50, requiresFasting: false },
  bun: { label: 'BUN', limit: 50, requiresFasting: false },
  urinalysis: { label: 'Urinalysis', limit: 100, requiresFasting: false },
  stool_exam: { label: 'Stool Exam (S/E)', limit: 30, requiresFasting: false },
  hbsag: { label: 'HBsAg', limit: 50, requiresFasting: false },
  syphilis: { label: 'Syphilis', limit: 50, requiresFasting: false },
  hiv: { label: 'HIV Test', limit: 50, requiresFasting: false },
  pregnancy: { label: 'Pregnancy Test', limit: 50, requiresFasting: false },
  gram_staining: { label: 'Gram Staining', limit: 50, requiresFasting: false },
  pap_smear: { label: 'Pap Smear', limit: 10, requiresFasting: false }
} as const

export type TestKey = keyof typeof TEST_CONFIG

// Half of each test's daily capacity is reserved for walk-ins; the other
// half is bookable online. Online limit rounds up so tiny quotas
// (e.g. OGTT limit 1) still allow at least 1 online booking.
export function onlineLimitFor(totalLimit: number): number {
  return Math.max(1, Math.ceil(totalLimit / 2))
}

export const LABORATORY_TESTS = Object.values(TEST_CONFIG).map(t => t.label)

export const FASTING_REQUIRED_TESTS = Object.values(TEST_CONFIG)
  .filter(t => t.requiresFasting)
  .map(t => t.label)
