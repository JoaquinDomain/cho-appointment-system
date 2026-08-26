'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, Filter, Calendar, User, MapPin, Clock, Scan, X, Trash2, FlaskConical, HeartHandshake, Hash, Users, CalendarCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Appointment, HEALTH_FACILITIES } from '@/lib/types'
import QRScanner from './QRScanner'

export default function AdminDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [facilityFilter, setFacilityFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const fetchAppointments = useCallback(() => {
    supabase
      .from('appointments')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error('Error fetching appointments:', error)
          setError('Failed to load appointments. Please check your authentication.')
        } else {
          setAppointments(data || [])
        }
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments])

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    return {
      total: appointments.length,
      today: appointments.filter(apt => apt.appointment_date === today).length,
      yakap: appointments.filter(apt => apt.yakap_registered).length
    }
  }, [appointments])

  const filteredAppointments = useMemo(() => {
    let filtered = appointments

    if (searchTerm) {
      filtered = filtered.filter(apt =>
        apt.patient_name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (facilityFilter) {
      filtered = filtered.filter(apt => apt.consultation_facility === facilityFilter)
    }

    return filtered
  }, [appointments, searchTerm, facilityFilter])

  const handleScanResult = (result: string) => {
    setShowScanner(false)

    // Find the appointment by ID
    const found = appointments.find(apt => apt.id === result)
    if (found) {
      openDetails(found)
    } else {
      alert('Appointment not found with this QR code')
    }
  }

  const openDetails = (appointment: Appointment) => {
    setSelectedAppointment(appointment)
    setConfirmingDelete(false)
    setDeleteError('')
  }

  const closeDetails = () => {
    setSelectedAppointment(null)
    setConfirmingDelete(false)
    setDeleteError('')
  }

  const handleDelete = async () => {
    if (!selectedAppointment) return
    setDeleting(true)
    setDeleteError('')
    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', selectedAppointment.id)
    setDeleting(false)
    if (error) {
      console.error('Error deleting appointment:', error)
      setDeleteError('Failed to delete. Please check your authentication and try again.')
    } else {
      setAppointments(prev => prev.filter(apt => apt.id !== selectedAppointment.id))
      closeDetails()
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading appointments...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center p-6 bg-red-50 rounded-lg">
          <p className="text-red-800">{error}</p>
          <button
            onClick={() => {
              setLoading(true)
              setError('')
              fetchAppointments()
            }}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-500 text-sm sm:text-base">CHO Laboratory Appointment Management</p>
          </div>
          <button
            onClick={() => setShowScanner(!showScanner)}
            className="inline-flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all hover:shadow-md hover:shadow-blue-300/50 font-medium"
          >
            <Scan className="w-5 h-5 mr-2" />
            {showScanner ? 'Close Scanner' : 'Scan QR Code'}
          </button>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
          <div className="rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-300/40">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-xs sm:text-sm font-medium">Total Appointments</p>
                <p className="text-2xl sm:text-3xl font-bold mt-1">{stats.total}</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
            </div>
          </div>
          <div className="rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-violet-600 to-indigo-500 text-white shadow-lg shadow-violet-300/40">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-violet-100 text-xs sm:text-sm font-medium">Today&apos;s Appointments</p>
                <p className="text-2xl sm:text-3xl font-bold mt-1">{stats.today}</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
                <CalendarCheck className="w-6 h-6" />
              </div>
            </div>
          </div>
          <div className="rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-300/40">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-100 text-xs sm:text-sm font-medium">YAKAP Registered</p>
                <p className="text-2xl sm:text-3xl font-bold mt-1">{stats.yakap}</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
                <HeartHandshake className="w-6 h-6" />
              </div>
            </div>
          </div>
        </div>

        {/* QR Scanner */}
        {showScanner && (
          <div className="mb-6">
            <QRScanner onScan={handleScanResult} onClose={() => setShowScanner(false)} />
          </div>
        )}

        {/* Search and Filter */}
        <div className="bg-white rounded-2xl shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by patient name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <select
                value={facilityFilter}
                onChange={(e) => setFacilityFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
              >
                <option value="">All Facilities</option>
                {HEALTH_FACILITIES.map(facility => (
                  <option key={facility} value={facility}>{facility}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 text-sm text-gray-600">
            Showing {filteredAppointments.length} of {appointments.length} appointments
          </div>
        </div>

        {/* Appointments: cards on mobile */}
        <div className="space-y-3 md:hidden">
          {filteredAppointments.length === 0 ? (
            <div className="bg-white rounded-2xl shadow p-8 text-center text-gray-500">
              No appointments found matching your criteria
            </div>
          ) : (
            filteredAppointments.map((appointment) => (
              <div key={appointment.id} className="bg-white rounded-2xl shadow p-4">
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div>
                    <button
                      onClick={() => openDetails(appointment)}
                      className="font-semibold text-blue-700 underline underline-offset-2 text-left"
                    >
                      {appointment.patient_name}
                    </button>
                    <p className="text-sm text-gray-500">Age {appointment.age}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    appointment.yakap_registered
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    YAKAP {appointment.yakap_registered ? 'YES' : 'NO'}
                  </span>
                </div>
                <div className="space-y-1.5 text-sm text-gray-600">
                  <p className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    {formatDate(appointment.appointment_date)}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    {appointment.consultation_facility}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-gray-400" />
                    Booked {formatDateTime(appointment.created_at)}
                  </p>
                </div>
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">Tests</p>
                  <div className="flex flex-wrap gap-1">
                    {appointment.selected_tests.map(test => (
                      <span key={test} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">
                        {test}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs font-mono text-gray-400 break-all">{appointment.id}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Appointments Table (desktop) */}
        <div className="hidden md:block bg-white rounded-2xl shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <User className="inline w-4 h-4 mr-1" />
                    Patient
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Age
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <Calendar className="inline w-4 h-4 mr-1" />
                    Appointment Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <MapPin className="inline w-4 h-4 mr-1" />
                    Facility
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    YAKAP
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tests
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <Clock className="inline w-4 h-4 mr-1" />
                    Booked
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Appointment ID
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAppointments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                      No appointments found matching your criteria
                    </td>
                  </tr>
                ) : (
                  filteredAppointments.map((appointment) => (
                    <tr key={appointment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => openDetails(appointment)}
                          className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                        >
                          {appointment.patient_name}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{appointment.age}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatDate(appointment.appointment_date)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{appointment.consultation_facility}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          appointment.yakap_registered 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {appointment.yakap_registered ? 'YES' : 'NO'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-500 max-w-xs truncate">
                          {appointment.selected_tests.join(', ')}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{formatDateTime(appointment.created_at)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-mono text-gray-900">{appointment.id}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Patient Detail Modal */}
        {selectedAppointment && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={closeDetails}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between p-5 border-b border-gray-100">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedAppointment.patient_name}</h2>
                  <p className="text-sm text-gray-500">Appointment Details</p>
                </div>
                <button
                  onClick={closeDetails}
                  className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Close details"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-start gap-2">
                    <User className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Age</p>
                      <p className="text-sm font-medium text-gray-900">{selectedAppointment.age}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Appointment Date</p>
                      <p className="text-sm font-medium text-gray-900">{formatDate(selectedAppointment.appointment_date)}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 sm:col-span-2">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Health Facility Where Consulted</p>
                      <p className="text-sm font-medium text-gray-900">{selectedAppointment.consultation_facility}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <HeartHandshake className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500 uppercase">YAKAP Registered</p>
                      <span className={`inline-block mt-0.5 px-2 py-0.5 text-xs font-medium rounded-full ${
                        selectedAppointment.yakap_registered
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {selectedAppointment.yakap_registered ? 'YES' : 'NO'}
                      </span>
                    </div>
                  </div>
                  {selectedAppointment.yakap_registered && selectedAppointment.yakap_facility && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500 uppercase">YAKAP Facility</p>
                        <p className="text-sm font-medium text-gray-900">{selectedAppointment.yakap_facility}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Booked At</p>
                      <p className="text-sm font-medium text-gray-900">{formatDateTime(selectedAppointment.created_at)}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-500 uppercase mb-1.5 flex items-center gap-1">
                    <FlaskConical className="w-3.5 h-3.5" /> Laboratory Tests
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedAppointment.selected_tests.map(test => (
                      <span key={test} className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                        {test}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-500 uppercase mb-1 flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5" /> Appointment ID
                  </p>
                  <p className="text-sm font-mono text-gray-900 break-all">{selectedAppointment.id}</p>
                </div>

                {deleteError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    {deleteError}
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 p-5 border-t border-gray-100">
                {confirmingDelete ? (
                  <>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 inline-flex items-center justify-center px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-60 font-medium"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {deleting ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                    <button
                      onClick={() => setConfirmingDelete(false)}
                      disabled={deleting}
                      className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-medium"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setConfirmingDelete(true)}
                      className="flex-1 inline-flex items-center justify-center px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-xl hover:bg-red-100 font-medium"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Record
                    </button>
                    <button
                      onClick={closeDetails}
                      className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-medium"
                    >
                      Close
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}