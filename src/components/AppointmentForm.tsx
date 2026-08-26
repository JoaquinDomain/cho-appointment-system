'use client'

import { useState } from 'react'
import { Calendar, User, MapPin, AlertCircle, CheckCircle, Download } from 'lucide-react'
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
      <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Appointment Confirmed!</h2>
          <p className="text-gray-600 mb-4">
            Please proceed to CHO Lab on your date of choice at 8:00 AM.
          </p>
          <div className="bg-gray-50 p-4 rounded-lg mb-4">
            <p className="text-sm text-gray-600 mb-2">Your Appointment ID:</p>
            <p className="text-lg font-mono font-bold text-gray-900">{qrCodeId}</p>
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
            className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Book Another Appointment
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Laboratory Appointment Booking</h1>
        <p className="text-gray-600">Fill out the form below to schedule your laboratory appointment.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Date Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Calendar className="inline w-4 h-4 mr-1" />
            Appointment Date
          </label>
          <input
            type="date"
            required
            min={new Date().toISOString().split('T')[0]}
            value={formData.appointmentDate}
            onChange={(e) => setFormData({ ...formData, appointmentDate: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Patient Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <User className="inline w-4 h-4 mr-1" />
              Full Name
            </label>
            <input
              type="text"
              required
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your full name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Age</label>
            <input
              type="number"
              required
              min="1"
              max="120"
              value={formData.age}
              onChange={(e) => setFormData({ ...formData, age: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your age"
            />
          </div>
        </div>

        {/* Health Facility */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <MapPin className="inline w-4 h-4 mr-1" />
            Health Facility Where Consulted
          </label>
          <select
            required
            value={formData.healthFacility}
            onChange={(e) => setFormData({ ...formData, healthFacility: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select a health facility</option>
            {HEALTH_FACILITIES.map(facility => (
              <option key={facility} value={facility}>{facility}</option>
            ))}
          </select>
        </div>

        {/* YAKAP Registration */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">YAKAP Registration Status</label>
          <div className="flex space-x-4">
            <label className="flex items-center">
              <input
                type="radio"
                name="yakapRegistered"
                checked={!formData.yakapRegistered}
                onChange={() => setFormData({ ...formData, yakapRegistered: false })}
                className="mr-2"
              />
              <span>No</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="yakapRegistered"
                checked={formData.yakapRegistered}
                onChange={() => setFormData({ ...formData, yakapRegistered: true })}
                className="mr-2"
              />
              <span>Yes</span>
            </label>
          </div>

          {!formData.yakapRegistered && (
            <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <AlertCircle className="inline w-4 h-4 mr-1" />
                YAKAP verification may be done at CHO. Charges or cost may be applied for non-CHO YAKAP registered.
              </p>
            </div>
          )}

          {formData.yakapRegistered && (
            <div className="mt-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">YAKAP Facility</label>
              <select
                required
                value={formData.yakapFacility}
                onChange={(e) => setFormData({ ...formData, yakapFacility: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select YAKAP facility</option>
                {HEALTH_FACILITIES.map(facility => (
                  <option key={facility} value={facility}>{facility}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Laboratory Tests */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Laboratory Tests</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto p-2 border border-gray-200 rounded-lg">
            {LABORATORY_TESTS.map(test => (
              <label key={test} className="flex items-start space-x-2 p-2 hover:bg-gray-50 rounded">
                <input
                  type="checkbox"
                  checked={formData.selectedTests.includes(test)}
                  onChange={() => handleTestToggle(test)}
                  className="mt-1"
                />
                <span className="text-sm text-gray-700">{test}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Fasting Warning */}
        {requiresFasting && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800 font-medium">
              <AlertCircle className="inline w-4 h-4 mr-1" />
              10–12 Hours Fasting is required prior to your test.
            </p>
          </div>
        )}

        {/* Error Message */}
        {submitError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{submitError}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || formData.selectedTests.length === 0}
          className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
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
      <div className="bg-white p-4 rounded-lg shadow-md border-2 border-blue-600">
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