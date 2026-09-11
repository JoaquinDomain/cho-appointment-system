'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, User, MapPin, Phone, AlertCircle, CheckCircle, Check, Download, Search, X, Moon, ClipboardCheck } from 'lucide-react'
import { HEALTH_FACILITIES, TEST_CONFIG, FASTING_REQUIRED_TESTS, onlineLimitFor } from '@/lib/types'
import { QRCodeCanvas } from 'qrcode.react'
import TurnstileWidget from '@/components/TurnstileWidget'

const TURNSTILE_ENABLED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)

interface FormData {
  fullName: string
  age: string
  contactNumber: string
  healthFacility: string
  yakapRegistered: boolean
  yakapFacility: string
  selectedTests: string[]
  appointmentDate: string
}

const FIELD_CLASS =
  'w-full px-4 py-3 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 bg-white shadow-sm outline-none transition focus:ring-2 focus:ring-sky-500 focus:border-sky-500'

function prettyDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function StepCard({
  step,
  title,
  subtitle,
  done,
  children,
}: {
  step: string
  title: string
  subtitle?: string
  done: boolean
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.06)] overflow-hidden">
      <div className="flex items-center gap-3 px-5 pt-4 pb-3.5 border-b border-slate-100">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${
            done ? 'bg-sky-600 text-white' : 'bg-sky-950 text-white'
          }`}
        >
          {done ? <Check className="w-4 h-4" /> : step}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[13px] font-bold text-slate-900 uppercase tracking-wider">{title}</h2>
          {subtitle ? <p className="text-xs text-slate-500 truncate">{subtitle}</p> : null}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function FastingGuide({
  title,
  rows,
  comeback,
  comebackSub,
}: {
  title: string
  rows: { time: string; desc: string }[]
  comeback: string
  comebackSub: string
}) {
  return (
    <div className="text-sm text-red-900">
      <p className="flex items-center gap-1.5 font-bold uppercase tracking-wide">
        <AlertCircle className="w-4 h-4 shrink-0" />
        {title}
      </p>
      <ol className="mt-3 space-y-2">
        {rows.map(r => (
          <li key={r.time} className="flex items-center gap-2.5">
            <span className="shrink-0 px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-bold tabular-nums">
              {r.time}
            </span>
            <span className="font-medium">{r.desc}</span>
          </li>
        ))}
      </ol>
      <div className="mt-3 rounded-xl bg-red-600/10 border border-red-200 px-3 py-2.5">
        <p className="font-bold">ABSOLUTELY NOTHING AFTERWARDS</p>
        <p className="italic text-red-800">(WALA GID IMNUN OR KAUNON PAGKATAPOS)</p>
      </div>
      <p className="mt-3 font-bold">{comeback}</p>
      <p className="italic text-red-800">({comebackSub})</p>
    </div>
  )
}

function FastingNotice({ selectedTests }: { selectedTests: string[] }) {
  const hasLipid = selectedTests.includes(TEST_CONFIG.lipid_profile.label)
  const hasFbs = selectedTests.includes(TEST_CONFIG.fbs.label)
  let body: React.ReactNode
  if (hasLipid && hasFbs) {
    body = (
      <FastingGuide
        title="Lipid Profile with FBS"
        rows={[
          { time: '6-7 PM', desc: 'DINNER (PANYAPON)' },
          { time: '9:00 PM', desc: 'LAST MEAL (ULIHI NGA KA-ON)' },
        ]}
        comeback="COME BACK 7:00 AM THE NEXT WORKING DAY"
        comebackSub="BALIK SA LABORATORY SA 7:00 SG AGA"
      />
    )
  } else if (hasLipid) {
    body = (
      <FastingGuide
        title="Lipid Profile only"
        rows={[
          { time: '8:00 PM', desc: 'DINNER (PANYAPON)' },
          { time: '9:00 PM', desc: 'LAST MEAL (ULIHI NGA KA-ON)' },
        ]}
        comeback="COME BACK 8:00 AM THE NEXT WORKING DAY"
        comebackSub="BALIK SA LABORATORY SA 8:00 SG AGA"
      />
    )
  } else if (hasFbs) {
    body = (
      <FastingGuide
        title="FBS only"
        rows={[
          { time: '6-8 PM', desc: 'DINNER (PANYAPON)' },
          { time: '1:00 AM', desc: 'SNACKS GID (ULIHI NGA KA-ON)' },
        ]}
        comeback="COME BACK 7:00 AM THE NEXT WORKING DAY"
        comebackSub="BALIK SA LABORATORY SA 7:00 SG AGA"
      />
    )
  } else {
    body = (
      <p className="text-sm text-red-900 font-medium">
        <AlertCircle className="inline w-4 h-4 mr-1" />
        10–12 Hours Fasting is required prior to your test.
      </p>
    )
  }
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-5 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-red-500 mb-2">
        Fasting instructions. Please read carefully
      </p>
      {body}
    </div>
  )
}

export default function AppointmentForm() {
  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    age: '',
    contactNumber: '',
    healthFacility: '',
    yakapRegistered: false,
    yakapFacility: '',
    selectedTests: [],
    appointmentDate: ''
  })

  const [testCounts, setTestCounts] = useState<Record<string, number>>({})
  const [quotasLoaded, setQuotasLoaded] = useState(false)
  const [loadingQuotas, setLoadingQuotas] = useState(false)
  const [quotaVersion, setQuotaVersion] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [qrCodeId, setQrCodeId] = useState('')
  const [testSearch, setTestSearch] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')

  useEffect(() => {
    let ignore = false
    const date = formData.appointmentDate

    if (!date) {
      queueMicrotask(() => {
        if (!ignore) {
          setTestCounts({})
          setQuotasLoaded(false)
        }
      })
      return
    }

    async function loadQuotas() {
      setLoadingQuotas(true)
      // Counts below belong to the previous date until this fetch lands.
      if (!ignore) setQuotasLoaded(false)
      try {
        const res = await fetch(`/api/quotas?date=${encodeURIComponent(date)}`, { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          if (!ignore) {
            const newCounts: Record<string, number> = data.counts || {}
            setTestCounts(newCounts)
            setQuotasLoaded(true)

            // Deselect any tests whose online share is fully booked for the
            // chosen date (half of capacity is reserved for walk-ins).
            const testConfigs = Object.values(TEST_CONFIG)
            setFormData(prev => {
              const validSelectedTests = prev.selectedTests.filter(testLabel => {
                const config = testConfigs.find(t => t.label === testLabel)
                if (!config) return true
                const count = newCounts[testLabel] || 0
                return count < onlineLimitFor(config.limit)
              })

              if (validSelectedTests.length !== prev.selectedTests.length) {
                return { ...prev, selectedTests: validSelectedTests }
              }
              return prev
            })
          }
        } else {
          console.error('Failed to fetch quota counts')
        }
      } catch (err) {
        console.error('Error fetching quotas:', err)
      } finally {
        if (!ignore) {
          setLoadingQuotas(false)
        }
      }
    }

    loadQuotas()

    return () => {
      ignore = true
    }
  }, [formData.appointmentDate, quotaVersion])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Client-side guard: never let a fully-booked-online test submit for
    // this date — force picking another day before hitting the server.
    if (quotasLoaded && formData.appointmentDate) {
      const full = formData.selectedTests.filter(label => {
        const cfg = Object.values(TEST_CONFIG).find(t => t.label === label)
        return cfg && (testCounts[label] || 0) >= onlineLimitFor(cfg.limit)
      })
      if (full.length > 0) {
        setSubmitError(
          `Online slots for this day are full: ${full.join(', ')}. Half of daily capacity is reserved for walk-ins. Please select another day.`
        )
        return
      }
    }
    setIsSubmitting(true)
    setSubmitError('')

    if (TURNSTILE_ENABLED && !turnstileToken) {
      setSubmitError('Please complete the human verification check below.')
      setIsSubmitting(false)
      return
    }

    try {
      // Secure path: validated + quota-checked + rate-limited server API
      // generates the UUID. No direct database write, no client-made ID.
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_name: formData.fullName.trim(),
          age: formData.age,
          contact_number: formData.contactNumber.trim(),
          consultation_facility: formData.healthFacility,
          yakap_registered: formData.yakapRegistered,
          yakap_facility: formData.yakapRegistered ? formData.yakapFacility : null,
          selected_tests: formData.selectedTests,
          appointment_date: formData.appointmentDate,
          ...(TURNSTILE_ENABLED ? { turnstileToken } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const rawDetails = (json as { details?: unknown }).details
        const details = Array.isArray(rawDetails)
          ? rawDetails.slice(0, 2).join(' ')
          : typeof rawDetails === 'string' && rawDetails
            ? rawDetails
            : ''
        const base = (json as { error?: string }).error ?? 'Submit failed'
        // Avoid "appointment.: detail" — use a space when base ends with '.'.
        const sep = details ? (base.endsWith('.') ? ' ' : ': ') : ''
        throw new Error(`${base}${sep}${details}`)
      }
      // Server-generated UUID (never trust a client-made ID).
      setQrCodeId((json as { id: string }).id)
      // Optimistically decrement availability for every booked test so the
      // UI reflects the new booking immediately.
      // The quota effect refetches from the server when returning to the form.
      setTestCounts(prev => {
        const next = { ...prev }
        for (const t of formData.selectedTests) {
          next[t] = (next[t] || 0) + 1
        }
        return next
      })
      setSubmitSuccess(true)
    } catch (error: unknown) {
      console.error('Error submitting appointment:', error)
      setSubmitError(
        error instanceof Error ? error.message : 'Failed to submit appointment. Please try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleTestToggle = (test: string) => {
    setFormData(prev => ({
      ...prev,
      selectedTests: prev.selectedTests.includes(test)
        ? prev.selectedTests.filter(t => t !== test)
        : [...prev.selectedTests, test]
    }))
  }

  const requiresFasting = formData.selectedTests.some(test =>
    (FASTING_REQUIRED_TESTS as readonly string[]).includes(test)
  )

  const testConfigs = Object.values(TEST_CONFIG)
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])

  const stepsDone = [
    formData.fullName.trim().length >= 2 && formData.age !== '' && formData.contactNumber.trim().length >= 7,
    formData.appointmentDate !== '' && formData.healthFacility !== '',
    true,
    formData.selectedTests.length > 0,
  ]
  const doneCount = stepsDone.filter(Boolean).length

  const filteredTests = testConfigs.filter(c =>
    c.label.toLowerCase().includes(testSearch.trim().toLowerCase())
  )

  if (submitSuccess) {
    return (
      <div className="bg-white rounded-3xl shadow-xl shadow-sky-900/10 border border-slate-200 overflow-hidden animate-fade-up">
        <div className="bg-gradient-to-br from-sky-800 to-cyan-600 px-6 sm:px-8 py-8 text-center text-white">
          <div className="mx-auto w-16 h-16 bg-white/20 border border-white/30 rounded-full flex items-center justify-center mb-3 animate-pulse-ring">
            <CheckCircle className="w-9 h-9 text-white" />
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight">Appointment Confirmed</h2>
          <p className="text-sky-50 text-sm mt-1">
            {formData.appointmentDate ? prettyDate(formData.appointmentDate) : 'Your chosen date'} at 8:00 AM. Please arrive on time.
          </p>
        </div>

        <div className="p-6 sm:p-8 space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-2">Booking summary</p>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Patient</dt>
                <dd className="font-semibold text-slate-900 text-right truncate">{formData.fullName || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Tests</dt>
                <dd className="font-semibold text-slate-900 text-right">{formData.selectedTests.length}</dd>
              </div>
            </dl>
            {formData.selectedTests.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {formData.selectedTests.map(t => (
                  <span key={t} className="px-2.5 py-1 bg-sky-100 text-sky-800 text-xs font-semibold rounded-full">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-cyan-50 p-4 text-center">
            <p className="text-xs text-slate-500 mb-1.5">Your Appointment ID</p>
            <p className="text-sm sm:text-base font-mono font-bold text-slate-900 break-all">{qrCodeId}</p>
          </div>

          <ConfirmationQRCode qrCodeId={qrCodeId} />

          {requiresFasting && (
            <FastingNotice selectedTests={formData.selectedTests} />
          )}

          <ol className="grid sm:grid-cols-3 gap-2 text-center">
            {['Bring a valid ID', 'Follow fasting guide', 'Show QR at the lab'].map((s, i) => (
              <li key={s} className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-medium text-slate-600">
                <span className="block text-sm font-bold text-sky-700">{i + 1}</span>{s}
              </li>
            ))}
          </ol>

          <button
            onClick={() => {
              setSubmitSuccess(false)
              // Keep the booked date so the user immediately sees the updated
              // availability instead of the base daily limit.
              // Bump quotaVersion to refetch authoritative counts from server.
              setFormData(prev => ({
                fullName: '',
                age: '',
                contactNumber: '',
                healthFacility: '',
                yakapRegistered: false,
                yakapFacility: '',
                selectedTests: [],
                appointmentDate: prev.appointmentDate
              }))
              setTestSearch('')
              setQuotaVersion(v => v + 1)
              setQrCodeId('')
            }}
            className="w-full px-6 py-3.5 bg-sky-950 text-white rounded-xl hover:bg-sky-900 transition-all hover:shadow-lg font-semibold"
          >
            Book Another Appointment
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-sky-900/10 border border-slate-200 overflow-hidden">
      <div className="px-5 sm:px-7 pt-6 pb-5 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Book a Laboratory Appointment</h1>
            <p className="text-slate-500 text-sm mt-1">Complete each step below to schedule your visit.</p>
          </div>
          <span className="shrink-0 px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-800 text-xs font-bold tabular-nums">
            {doneCount}/4 steps
          </span>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-600 to-cyan-500 transition-all duration-500"
            style={{ width: `${(doneCount / 4) * 100}%` }}
          />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 bg-slate-50/60">
        <StepCard step="1" title="Patient Information" done={stepsDone[0]}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Full Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className={`${FIELD_CLASS} pl-10`}
                  placeholder="Juan D. Cruz"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Age <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min="1"
                max="120"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                className={FIELD_CLASS}
                placeholder="e.g. 34"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Contact Number <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="tel"
                required
                value={formData.contactNumber}
                onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                className={`${FIELD_CLASS} pl-10`}
                placeholder="e.g. 0917 123 4567"
              />
            </div>
          </div>
        </StepCard>

        <StepCard step="2" title="Schedule and Facility" done={stepsDone[1]}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Appointment Date <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="date"
                  required
                  min={todayStr}
                  value={formData.appointmentDate}
                  onChange={(e) => setFormData({ ...formData, appointmentDate: e.target.value })}
                  className={`${FIELD_CLASS} pl-10`}
                />
              </div>
              {formData.appointmentDate && (
                <p className="mt-1.5 text-xs font-medium text-sky-700">{prettyDate(formData.appointmentDate)}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Health Facility Where Consulted <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <select
                  required
                  value={formData.healthFacility}
                  onChange={(e) => setFormData({ ...formData, healthFacility: e.target.value })}
                  className={`${FIELD_CLASS} pl-10 appearance-none ${formData.healthFacility ? '' : 'text-slate-400'}`}
                >
                  <option value="">Select a health facility</option>
                  {HEALTH_FACILITIES.map(facility => (
                    <option key={facility} value={facility}>{facility}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </StepCard>

        <StepCard step="3" title="YAKAP Registration" subtitle="PhilHealth YAKAP membership status" done={stepsDone[2]}>
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100 border border-slate-200">
            {[
              { value: false, label: 'Not registered', hint: 'No' },
              { value: true, label: 'Registered', hint: 'Yes' },
            ].map(opt => (
              <button
                key={opt.hint}
                type="button"
                onClick={() => setFormData({ ...formData, yakapRegistered: opt.value })}
                aria-pressed={formData.yakapRegistered === opt.value}
                className={`flex flex-col items-center gap-0.5 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  formData.yakapRegistered === opt.value
                    ? 'bg-white text-sky-900 shadow border border-slate-200'
                    : 'text-slate-500 hover:text-slate-700 border border-transparent'
                }`}
              >
                {opt.hint}
                <span className="text-[11px] font-normal opacity-70">{opt.label}</span>
              </button>
            ))}
          </div>

          {!formData.yakapRegistered && (
            <div className="mt-3 flex gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
              <p className="text-[13px] leading-relaxed text-amber-900">
                YAKAP verification may be done at CHO. Charges or cost may be applied for non-CHO YAKAP registered patients.
              </p>
            </div>
          )}

          {formData.yakapRegistered && (
            <div className="mt-4">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                YAKAP Facility <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formData.yakapFacility}
                onChange={(e) => setFormData({ ...formData, yakapFacility: e.target.value })}
                className={`${FIELD_CLASS} ${formData.yakapFacility ? '' : 'text-slate-400'}`}
              >
                <option value="">Select YAKAP facility</option>
                {HEALTH_FACILITIES.map(facility => (
                  <option key={facility} value={facility}>{facility}</option>
                ))}
              </select>
            </div>
          )}
        </StepCard>

        <StepCard
          step="4"
          title={`Laboratory Tests${formData.selectedTests.length > 0 ? ` (${formData.selectedTests.length} selected)` : ''}`}
          done={stepsDone[3]}
        >
          <div className="relative mb-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={testSearch}
              onChange={(e) => setTestSearch(e.target.value)}
              className={`${FIELD_CLASS} pl-10 pr-9`}
              placeholder="Search tests, e.g. CBC"
              aria-label="Search laboratory tests"
            />
            {testSearch && (
              <button
                type="button"
                onClick={() => setTestSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs text-slate-500">
              {formData.appointmentDate
                ? `Online slots for ${prettyDate(formData.appointmentDate)}. If a test is fully booked, please select another day.`
                : 'Select a date above to see live slot availability.'}
            </p>
            {formData.selectedTests.length > 0 && (
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, selectedTests: [] }))}
                className="shrink-0 ml-2 text-xs font-semibold text-sky-700 hover:text-sky-900 hover:underline underline-offset-2"
              >
                Clear
              </button>
            )}
          </div>
          {loadingQuotas && (
            <p className="text-xs text-sky-600 mb-2.5 animate-pulse">Checking test availability for selected date...</p>
          )}

          {filteredTests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No tests match &ldquo;{testSearch}&rdquo;.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredTests.map(config => {
                const test = config.label
                // Online-bookable share only; remainder is held for walk-ins.
                const limit = onlineLimitFor(config.limit)
                // Only trust counts actually loaded for the selected date —
                // never display a "0 booked" that is just missing data.
                const bookedCount = quotasLoaded ? testCounts[test] || 0 : 0
                const availableCount = Math.max(0, limit - bookedCount)
                const hasQuotaData = Boolean(formData.appointmentDate) && quotasLoaded
                const isFullyBooked = hasQuotaData && bookedCount >= limit
                const checked = formData.selectedTests.includes(test)
                const pct = Math.round((availableCount / limit) * 100)

                return (
                  <label
                    key={test}
                    className={`group flex flex-col gap-2 p-3.5 rounded-xl border-2 transition-all ${
                      isFullyBooked
                        ? 'border-slate-200 bg-slate-100/70 cursor-not-allowed opacity-70'
                        : checked
                        ? 'border-sky-600 bg-sky-50/70 shadow-sm cursor-pointer'
                        : 'border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/40 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isFullyBooked}
                          onChange={() => handleTestToggle(test)}
                          className="mt-0.5 w-4 h-4 shrink-0 accent-sky-700 disabled:cursor-not-allowed"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className={`text-sm truncate ${isFullyBooked ? 'text-slate-400 line-through' : checked ? 'text-sky-950 font-semibold' : 'text-slate-700'}`}>
                            {test}
                          </span>
                          <span className="text-[11px] text-slate-500 tabular-nums">
                            {hasQuotaData
                              ? `${availableCount} of ${limit} online slots left`
                              : `Up to ${limit} online per day`}
                          </span>
                        </div>
                      </div>
                      {config.requiresFasting ? (
                        <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wide" title="Fasting required">
                          <Moon className="w-3 h-3" /> Fasting
                        </span>
                      ) : null}
                    </div>
                    {hasQuotaData && !isFullyBooked && (
                      <div className="h-1.5 rounded-full bg-slate-200/80 overflow-hidden" aria-hidden="true">
                        <div
                          className={`h-full rounded-full ${pct <= 20 ? 'bg-red-500' : pct <= 50 ? 'bg-amber-500' : 'bg-sky-600'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                    {isFullyBooked && (
                      <span className="self-start px-2 py-0.5 text-[11px] font-bold rounded-full bg-red-100 text-red-700 border border-red-200">
                        Fully booked: pick another day
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          )}

          {formData.selectedTests.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {formData.selectedTests.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTestToggle(t)}
                  className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 bg-sky-950 text-white text-xs font-medium rounded-full hover:bg-sky-900"
                  title={`Remove ${t}`}
                >
                  {t}
                  <X className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
          )}
        </StepCard>

        {requiresFasting && (
          <FastingNotice selectedTests={formData.selectedTests} />
        )}

        {submitError && (
          <div className="flex gap-2.5 p-4 bg-red-50 border border-red-200 rounded-2xl" role="alert">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
            <p className="text-sm text-red-800 leading-relaxed">{submitError}</p>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 sm:sticky sm:bottom-4">
          {TURNSTILE_ENABLED && (
            <div className="mb-3">
              <TurnstileWidget
                onToken={setTurnstileToken}
                onExpire={() => setTurnstileToken('')}
              />
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-slate-600 mb-3">
            <ClipboardCheck className="w-4 h-4 text-sky-700 shrink-0" />
            {formData.selectedTests.length > 0 && formData.appointmentDate ? (
              <span>
                <strong className="text-slate-900">{formData.selectedTests.length} test{formData.selectedTests.length > 1 ? 's' : ''}</strong>
                {' '}on <strong className="text-slate-900">{prettyDate(formData.appointmentDate)}</strong>
              </span>
            ) : (
              <span>Select a date and at least one test to continue.</span>
            )}
          </div>
          <button
            type="submit"
            disabled={isSubmitting || formData.selectedTests.length === 0}
            className="w-full px-6 py-4 bg-gradient-to-r from-sky-800 to-cyan-600 text-white rounded-xl hover:from-sky-900 hover:to-cyan-700 transition-all hover:shadow-xl hover:shadow-sky-500/25 hover:-translate-y-0.5 disabled:from-slate-300 disabled:to-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none font-bold text-base shadow-lg"
          >
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Submitting...
              </span>
            ) : (
              'Submit Appointment'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

function ConfirmationQRCode({ qrCodeId }: { qrCodeId: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const handleDownload = () => {
    const canvas = wrapRef.current?.querySelector('canvas') as HTMLCanvasElement | undefined
    if (canvas) {
      const link = document.createElement('a')
      link.download = `appointment-qr-${qrCodeId}.png`
      link.href = canvas.toDataURL()
      link.click()
    }
  }

  return (
    <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="p-1.5 rounded-2xl bg-gradient-to-br from-sky-800 to-cyan-600 shadow-lg shadow-sky-500/25">
        <div ref={wrapRef} className="bg-white p-4 rounded-xl">
          <QRCodeCanvas value={qrCodeId} size={200} level="H" />
        </div>
      </div>
      <p className="text-[13px] text-slate-600 mt-3 font-medium">Show this QR code at the laboratory</p>
      <button
        onClick={handleDownload}
        className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-sky-800 hover:border-sky-400 hover:bg-sky-50 text-sm font-semibold transition-colors"
      >
        <Download className="w-4 h-4" />
        Download QR Code
      </button>
    </div>
  )
}
