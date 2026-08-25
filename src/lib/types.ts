export interface Appointment {
  id: string
  full_name: string
  age: number
  health_facility: string
  yakap_registered: 'YES' | 'NO'
  yakap_facility?: string
  selected_tests: string[]
  appointment_date: string
  created_at: string
  qr_code_id: string
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

export const LABORATORY_TESTS = [
  'Panel (CBC, Platelet, Lipid Profile, FBS, Creatinine, Uric Acid)',
  'Blood Typing',
  'CBC / Platelet Count',
  'Fecal Occult Blood',
  'Stool Exam',
  'Urinalysis',
  'Dengue NS1 / Dengue Duo',
  'HBsAg',
  'Pregnancy Test',
  'Syphilis',
  'SGPT / SGOT',
  'BUN',
  'Creatinine',
  'Uric Acid',
  'Lipid Profile',
  'FBS',
  'OGTT'
] as const

export const FASTING_REQUIRED_TESTS = [
  'Panel (CBC, Platelet, Lipid Profile, FBS, Creatinine, Uric Acid)',
  'FBS',
  'Lipid Profile'
] as const
