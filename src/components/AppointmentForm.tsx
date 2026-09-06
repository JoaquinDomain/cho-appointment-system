'use client'

import { useEffect, useRef, useState } from 'react'
import { Calendar, User, MapPin, AlertCircle, CheckCircle, Download, FlaskConical, HeartHandshake } from 'lucide-react'
import { HEALTH_FACILITIES, TEST_CONFIG, FASTING_REQUIRED_TESTS } from '@/lib/types'
import { QRCodeCanvas } from 'qrcode.react'

interface FormData {
  fullName: string
  age: string
  healthFacility: string
  yakapRegistered: boolean
  yakapFacility: string
  selectedTests: string[]
  appointmentDate: string
}

function SectionHeading({ icon, title, tone }: { icon: React.ReactNode; title: string; tone: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${tone} text-white flex items-center justify-center shadow-md`}>
        {icon}
      </div>
      <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">{title}</h2>
    </div>
  )
}

export default function AppointmentForm() {
  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    age: '',
    healthFacility: '',
    yakapRegistered: false,
    yakapFacility: '',
    selectedTests: [],
    appointmentDate: ''
  })

  const [testCounts, setTestCounts] = useState<Record<string, number>>({})
  const [quotasLoaded, setQuotasLoaded] = useState(false)
  const [loadingQuotas, setLoadingQuotas] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [qrCodeId, setQrCodeId] = useState('')

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

            // Deselect any tests that are fully booked for the chosen date
            const testConfigs = Object.values(TEST_CONFIG)
            setFormData(prev => {
              const validSelectedTests = prev.selectedTests.filter(testLabel => {
                const config = testConfigs.find(t => t.label === testLabel)
                if (!config) return true
                const count = newCounts[testLabel] || 0
                return count < config.limit
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
  }, [formData.appointmentDate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitError('')

    try {
      // Secure path: validated + quota-checked + rate-limited server API
      // generates the UUID. No direct database write, no client-made ID.
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_name: formData.fullName.trim(),
          age: formData.age,
          consultation_facility: formData.healthFacility,
          yakap_registered: formData.yakapRegistered,
          yakap_facility: formData.yakapRegistered ? formData.yakapFacility : null,
          selected_tests: formData.selectedTests,
          appointment_date: formData.appointmentDate,
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

  if (submitSuccess) {
    return (
      <div className="bg-white rounded-3xl shadow-2xl shadow-blue-200/50 p-6 sm:p-8 border border-blue-100 animate-fade-up">
        <div className="text-center">
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-emerald-400 to-green-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-green-300/50">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Appointment Confirmed!</h2>
          <p className="text-gray-600 mb-4">
            Please proceed to CHO Lab on your date of choice at 8:00 AM.
          </p>
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 p-4 rounded-2xl mb-4">
            <p className="text-sm text-gray-600 mb-2">Your Appointment ID:</p>
            <p className="text-sm sm:text-lg font-mono font-bold text-gray-900 break-all">{qrCodeId}</p>
          </div>
          <ConfirmationQRCode qrCodeId={qrCodeId} />
          <button
            onClick={() => {
              setSubmitSuccess(false)
              setFormData({
                fullName: '',
                age: '',
                healthFacility: '',
                yakapRegistered: false,
                yakapFacility: '',
                selectedTests: [],
                appointmentDate: ''
              })
              setQrCodeId('')
            }}
            className="mt-6 w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all hover:shadow-lg hover:shadow-blue-300/50 font-semibold"
          >
            Book Another Appointment
          </button>
        </div>
      </div>
    )
  }

  const testConfigs = Object.values(TEST_CONFIG)

  return (
    <div className="bg-white/90 backdrop-blur rounded-3xl shadow-2xl shadow-blue-200/50 p-4 sm:p-8 border border-blue-100">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">Book a Laboratory Appointment</h1>
        <p className="text-gray-500 text-sm sm:text-base">Fill out the form below to schedule your laboratory appointment.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-7">
        {/* Patient Information */}
        <section>
          <SectionHeading icon={<User className="w-4 h-4" />} title="Patient Information" tone="from-blue-500 to-cyan-500" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
              <input
                type="text"
                required
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your full name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Age</label>
              <input
                type="number"
                required
                min="1"
                max="120"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your age"
              />
            </div>
          </div>
        </section>

        {/* Appointment Date */}
        <section>
          <SectionHeading icon={<Calendar className="w-4 h-4" />} title="Appointment Date" tone="from-violet-500 to-purple-500" />
          <input
            type="date"
            required
            min={new Date().toISOString().split('T')[0]}
            value={formData.appointmentDate}
            onChange={(e) => setFormData({ ...formData, appointmentDate: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </section>

        {/* Health Facility */}
        <section>
          <SectionHeading icon={<MapPin className="w-4 h-4" />} title="Health Facility Where Consulted" tone="from-emerald-500 to-teal-500" />
          <select
            required
            value={formData.healthFacility}
            onChange={(e) => setFormData({ ...formData, healthFacility: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select a health facility</option>
            {HEALTH_FACILITIES.map(facility => (
              <option key={facility} value={facility}>{facility}</option>
            ))}
          </select>
        </section>

        {/* YAKAP Registration */}
        <section>
          <SectionHeading icon={<HeartHandshake className="w-4 h-4" />} title="YAKAP Registration Status" tone="from-rose-500 to-pink-500" />
          <div className="grid grid-cols-2 gap-3">
            <label
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 cursor-pointer transition-colors font-medium ${
                !formData.yakapRegistered
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="yakapRegistered"
                checked={!formData.yakapRegistered}
                onChange={() => setFormData({ ...formData, yakapRegistered: false })}
                className="sr-only"
              />
              No
            </label>
            <label
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 cursor-pointer transition-colors font-medium ${
                formData.yakapRegistered
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="yakapRegistered"
                checked={formData.yakapRegistered}
                onChange={() => setFormData({ ...formData, yakapRegistered: true })}
                className="sr-only"
              />
              Yes
            </label>
          </div>

          {!formData.yakapRegistered && (
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
              <p className="text-sm text-yellow-800">
                <AlertCircle className="inline w-4 h-4 mr-1" />
                YAKAP verification may be done at CHO. Charges or cost may be applied for non-CHO YAKAP registered.
              </p>
            </div>
          )}

          {formData.yakapRegistered && (
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">YAKAP Facility</label>
              <select
                required
                value={formData.yakapFacility}
                onChange={(e) => setFormData({ ...formData, yakapFacility: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select YAKAP facility</option>
                {HEALTH_FACILITIES.map(facility => (
                  <option key={facility} value={facility}>{facility}</option>
                ))}
              </select>
            </div>
          )}
        </section>

        {/* Laboratory Tests */}
        <section>
          <SectionHeading icon={<FlaskConical className="w-4 h-4" />} title="Laboratory Tests" tone="from-amber-500 to-orange-500" />
          {loadingQuotas && (
            <p className="text-xs text-blue-600 mb-3 animate-pulse">Checking test availability for selected date...</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {testConfigs.map(config => {
              const test = config.label
              const limit = config.limit
              // Only trust counts actually loaded for the selected date —
              // never display a "0 booked" that is just missing data.
              const bookedCount = quotasLoaded ? testCounts[test] || 0 : 0
              const availableCount = limit - bookedCount
              const hasQuotaData = Boolean(formData.appointmentDate) && quotasLoaded
              const isFullyBooked = hasQuotaData && bookedCount >= limit
              const checked = formData.selectedTests.includes(test)

              return (
                <label
                  key={test}
                  className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                    isFullyBooked
                      ? 'border-gray-200 bg-gray-100/80 cursor-not-allowed opacity-75'
                      : checked
                      ? 'border-blue-600 bg-gradient-to-br from-blue-50 to-cyan-50 shadow-sm shadow-blue-200 cursor-pointer'
                      : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isFullyBooked}
                      onChange={() => handleTestToggle(test)}
                      className="mt-0.5 w-4 h-4 accent-blue-600 disabled:cursor-not-allowed"
                    />
                    <div className="flex flex-col">
                      <span className={`text-sm ${isFullyBooked ? 'text-gray-400 line-through' : checked ? 'text-blue-900 font-medium' : 'text-gray-700'}`}>
                        {test}
                      </span>
                      <span className="text-[11px] text-gray-500 font-normal">
                        {hasQuotaData
                          ? `${availableCount} / ${limit} available`
                          : `Daily Limit: ${limit}`}
                      </span>
                    </div>
                  </div>
                  {isFullyBooked && (
                    <span className="shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700 border border-red-200">
                      Fully Booked
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        </section>

        {/* Fasting Warning */}
        {requiresFasting && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-800 font-medium">
              <AlertCircle className="inline w-4 h-4 mr-1" />
              10–12 Hours Fasting is required prior to your test.
            </p>
          </div>
        )}

        {/* Error Message */}
        {submitError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-800">{submitError}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || formData.selectedTests.length === 0}
          className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 text-white rounded-2xl hover:from-blue-700 hover:via-blue-600 hover:to-cyan-600 transition-all hover:shadow-xl hover:shadow-blue-400/40 hover:-translate-y-0.5 disabled:from-gray-400 disabled:via-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none font-semibold text-base shadow-lg shadow-blue-600/25"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Appointment'}
        </button>
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
    <div className="flex flex-col items-center">
      <div className="p-1 rounded-3xl bg-gradient-to-br from-blue-600 via-cyan-500 to-blue-600 shadow-lg shadow-blue-300/50">
        <div ref={wrapRef} className="bg-white p-4 rounded-[1.35rem]">
          <QRCodeCanvas value={qrCodeId} size={200} level="H" />
        </div>
      </div>
      <p className="text-sm text-gray-600 mt-2">Show this QR code at the laboratory</p>
      <button
        onClick={handleDownload}
        className="mt-2 flex items-center text-blue-600 hover:text-blue-800 text-sm font-medium"
      >
        <Download className="w-4 h-4 mr-1" />
        Download QR Code
      </button>
    </div>
  )
}
