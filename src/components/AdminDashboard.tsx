'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Filter, Calendar, User, MapPin, Clock, Scan, X, Trash2, FlaskConical, HeartHandshake, Hash, Users, CalendarCheck } from 'lucide-react'
import { Appointment, HEALTH_FACILITIES } from '@/lib/types'
import QRScanner from './QRScanner'

const PAGE_SIZE = 25

function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function AdminDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [facilityFilter, setFacilityFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({ total: 0, today: 0, yakap: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [scanError, setScanError] = useState('')
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Server-side paginated + filtered list via admin-only API (service_role).
  // No direct database read from the browser; session cookie authenticates.
  const fetchAppointments = useCallback(async (pageNum: number, search: string, facility: string) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        limit: String(PAGE_SIZE),
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(facility ? { facility } : {}),
      })
      const [listRes, todayRes, yakapRes] = await Promise.all([
        fetch(`/api/appointments?${params.toString()}`, { credentials: 'same-origin' }),
        fetch(`/api/appointments?date=${todayLocal()}&limit=1`, { credentials: 'same-origin' }),
        fetch(`/api/appointments?yakap=true&limit=1`, { credentials: 'same-origin' }),
      ])
      if (listRes.status === 401) throw new Error('Session expired. Please log in again.')
      if (!listRes.ok) throw new Error('Failed to load appointments.')
      const listJson = await listRes.json()
      setAppointments(listJson.data ?? [])
      setTotal(listJson.total ?? 0)
      // Stats from server-side counts (accurate with pagination)
      const tJson = todayRes.ok ? await todayRes.json().catch(() => null) : null
      const yJson = yakapRes.ok ? await yakapRes.json().catch(() => null) : null
      setStats({
        total: listJson.total ?? 0,
        today: typeof tJson?.total === 'number' ? tJson.total : 0,
        yakap: typeof yJson?.total === 'number' ? yJson.total : 0,
      })
    } catch (err) {
      console.error('Error fetching appointments:', err)
      setError(err instanceof Error ? err.message : 'Failed to load appointments.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim())
    }, 400)
    return () => clearTimeout(t)
  }, [searchTerm])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAppointments(page, debouncedSearch, facilityFilter)
  }, [fetchAppointments, page, debouncedSearch, facilityFilter])

  // Server returns already-filtered page; keep name for minimal template diff.
  const filteredAppointments = appointments

  const handleScanResult = async (result: string) => {
    setShowScanner(false)
    setScanError('')
    const id = result.trim()
    // 1) hit current page first for instant feedback
    const local = appointments.find(apt => apt.id === id)
    if (local) {
      openDetails(local)
      return
    }
    // 2) admin-only server lookup (validates UUID + session server-side)
    try {
      const res = await fetch(`/api/appointments/${encodeURIComponent(id)}`, {
        credentials: 'same-origin',
      })
      if (res.status === 404) {
        setScanError('Appointment not found with this QR code.')
        return
      }
      if (!res.ok) throw new Error('Lookup failed.')
      const json = await res.json()
      openDetails(json.data as Appointment)
    } catch (err) {
      console.error('QR lookup failed:', err)
      setScanError('QR lookup failed. Please try again.')
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
    try {
      const res = await fetch(`/api/appointments/${encodeURIComponent(selectedAppointment.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Delete failed.')
      }
      setAppointments(prev => prev.filter(apt => apt.id !== selectedAppointment.id))
      setTotal(t => Math.max(t - 1, 0))
      closeDetails()
    } catch (err) {
      console.error('Error deleting appointment:', err)
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete. Please try again.')
    } finally {
      setDeleting(false)
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
              fetchAppointments(page, debouncedSearch, facilityFilter)
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
        {scanError && (
          <div className="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800">
            {scanError}
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
                onChange={(e) => { setPage(1); setSearchTerm(e.target.value) }}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <select
                value={facilityFilter}
                onChange={(e) => { setPage(1); setFacilityFilter(e.target.value) }}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
              >
                <option value="">All Facilities</option>
                {HEALTH_FACILITIES.map(facility => (
                  <option key={facility} value={facility}>{facility}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-gray-600">
            <span>Showing {filteredAppointments.length} of {total} appointments (page {page})</span>
            <span className="inline-flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                disabled={page <= 1 || loading}
                className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                Prev
              </button>
              <button
                onClick={() => setPage(p => (filteredAppointments.length === PAGE_SIZE ? p + 1 : p))}
                disabled={filteredAppointments.length < PAGE_SIZE || loading}
                className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                Next
              </button>
            </span>
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