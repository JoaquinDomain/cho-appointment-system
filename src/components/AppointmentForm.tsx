'use client'

import { useState } from 'react'
import { Calendar, User, MapPin, AlertCircle, CheckCircle, Download, FlaskConical, HeartHandshake } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { HEALTH_FACILITIES, LABORATORY_TESTS, FASTING_REQUIRED_TESTS } from '@/lib/types'
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

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
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

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [qrCodeId, setQrCodeId] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitError('')

    try {
      // Generate the ID client-side: RLS allows anon inserts but not selects,
      // so PostgREST cannot return the row after inserting it.
      const appointmentId = crypto.randomUUID()

      const { error } = await supabase.from('appointments').insert({
        id: appointmentId,
        patient_name: formData.fullName,
        age: parseInt(formData.age),
        consultation_facility: formData.healthFacility,
        yakap_registered: formData.yakapRegistered,
        yakap_facility: formData.yakapRegistered ? formData.yakapFacility : null,
        selected_tests: formData.selectedTests,
        appointment_date: formData.appointmentDate
      })

      if (error) throw error

      setQrCodeId(appointmentId)
      setSubmitSuccess(true)
    } catch (error) {
      console.error('Error submitting appointment:', error)
      setSubmitError('Failed to submit appointment. Please try again.')
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
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 border border-blue-100">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Appointment Confirmed!</h2>
          <p className="text-gray-600 mb-4">
            Please proceed to CHO Lab on your date of choice at 8:00 AM.
          </p>
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl mb-4">
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
            className="mt-6 w-full sm:w-auto px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold"
          >
            Book Another Appointment
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-8 border border-blue-100">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">Book a Laboratory Appointment</h1>
        <p className="text-gray-500 text-sm sm:text-base">Fill out the form below to schedule your laboratory appointment.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-7">
        {/* Patient Information */}
        <section>
          <SectionHeading icon={<User className="w-4 h-4" />} title="Patient Information" />
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
          <SectionHeading icon={<Calendar className="w-4 h-4" />} title="Appointment Date" />
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
          <SectionHeading icon={<MapPin className="w-4 h-4" />} title="Health Facility Where Consulted" />
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
          <SectionHeading icon={<HeartHandshake className="w-4 h-4" />} title="YAKAP Registration Status" />
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
          <SectionHeading icon={<FlaskConical className="w-4 h-4" />} title="Laboratory Tests" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {LABORATORY_TESTS.map(test => {
              const checked = formData.selectedTests.includes(test)
              return (
                <label
                  key={test}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                    checked
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleTestToggle(test)}
                    className="mt-0.5 w-4 h-4 accent-blue-600"
                  />
                  <span className={`text-sm ${checked ? 'text-blue-900 font-medium' : 'text-gray-700'}`}>{test}</span>
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
          className="w-full px-6 py-3.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-colors disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed font-semibold text-base shadow-lg shadow-blue-600/20"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Appointment'}
        </button>
      </form>
    </div>
  )
}

function ConfirmationQRCode({ qrCodeId }: { qrCodeId: string }) {
  const handleDownload = () => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement
    if (canvas) {
      const link = document.createElement('a')
      link.download = `appointment-qr-${qrCodeId}.png`
      link.href = canvas.toDataURL()
      link.click()
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div className="bg-white p-4 rounded-2xl shadow-md border-2 border-blue-600">
        <QRCodeCanvas value={qrCodeId} size={200} level="H" />
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
