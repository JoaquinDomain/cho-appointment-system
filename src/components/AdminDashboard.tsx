'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Filter, Calendar, User, MapPin, Clock, Scan, X, Trash2, FlaskConical, HeartHandshake, Hash, Users, CalendarCheck, Download, Pencil, BarChart3 } from 'lucide-react'
import { Appointment, HEALTH_FACILITIES, APPOINTMENT_STATUSES, TEST_CONFIG, type AppointmentStatus } from '@/lib/types'
import QRScanner from './QRScanner'

const PAGE_SIZE = 25

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-200 text-gray-600',
}

function toCsvCell(value: string | number): string {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

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
  const [dateFilter, setDateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
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
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ patient_name: '', age: '', consultation_facility: '', appointment_date: '' })
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showQuotas, setShowQuotas] = useState(false)
  const [quotaDate, setQuotaDate] = useState(() => todayLocal())
  const [quotaCounts, setQuotaCounts] = useState<Record<string, number>>({})
  const [quotaLoading, setQuotaLoading] = useState(false)

  // Server-side paginated + filtered list via admin-only API.
  // No direct database read from the browser; session cookie authenticates.
  const fetchAppointments = useCallback(async (pageNum: number, search: string, facility: string, date: string, status: string) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        limit: String(PAGE_SIZE),
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(facility ? { facility } : {}),
        ...(date ? { date } : {}),
        ...(status ? { status } : {}),
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
    void fetchAppointments(page, debouncedSearch, facilityFilter, dateFilter, statusFilter)
  }, [fetchAppointments, page, debouncedSearch, facilityFilter, dateFilter, statusFilter])

  const fetchQuotas = useCallback(async (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    setQuotaLoading(true)
    try {
      const res = await fetch(`/api/quotas?date=${encodeURIComponent(date)}`, { credentials: 'same-origin' })
      const json = await res.json().catch(() => ({}))
      setQuotaCounts((json as { counts?: Record<string, number> }).counts ?? {})
    } catch {
      setQuotaCounts({})
    } finally {
      setQuotaLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (showQuotas) void fetchQuotas(quotaDate)
  }, [showQuotas, quotaDate, fetchQuotas])

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
    setEditing(false)
    setEditError('')
  }

  const closeDetails = () => {
    setSelectedAppointment(null)
    setConfirmingDelete(false)
    setDeleteError('')
    setEditing(false)
    setEditError('')
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

  const handleStatusChange = async (next: AppointmentStatus) => {
    if (!selectedAppointment || updatingStatus) return
    setUpdatingStatus(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/appointments/${encodeURIComponent(selectedAppointment.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        const rawDetails = (json as { details?: unknown }).details
        const details = Array.isArray(rawDetails)
          ? rawDetails.slice(0, 2).join(' ')
          : typeof rawDetails === 'string' && rawDetails
            ? rawDetails
            : ''
        const base = (json as { error?: string }).error ?? 'Status update failed.'
        throw new Error(details ? `${base}${base.endsWith('.') ? ' ' : ': '}${details}` : base)
      }
      const updated = { ...selectedAppointment, status: next }
      setSelectedAppointment(updated)
      setAppointments(prev => prev.map(a => (a.id === updated.id ? updated : a)))
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to update status.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const openEdit = () => {
    if (!selectedAppointment) return
    setEditForm({
      patient_name: selectedAppointment.patient_name,
      age: String(selectedAppointment.age),
      consultation_facility: selectedAppointment.consultation_facility,
      appointment_date: selectedAppointment.appointment_date,
    })
    setEditError('')
    setEditing(true)
  }

  const handleSaveEdit = async () => {
    if (!selectedAppointment || savingEdit) return
    setSavingEdit(true)
    setEditError('')
    try {
      const res = await fetch(`/api/appointments/${encodeURIComponent(selectedAppointment.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          patient_name: editForm.patient_name,
          age: Number(editForm.age),
          consultation_facility: editForm.consultation_facility,
          yakap_registered: selectedAppointment.yakap_registered,
          yakap_facility: selectedAppointment.yakap_facility ?? null,
          selected_tests: selectedAppointment.selected_tests,
          appointment_date: editForm.appointment_date,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const details = Array.isArray((json as { details?: string[] }).details)
          ? `: ${(json as { details: string[] }).details.join(' ')}`
          : ''
        throw new Error(`${(json as { error?: string }).error ?? 'Update failed.'}${details}`)
      }
      const updated = {
        ...selectedAppointment,
        patient_name: editForm.patient_name.trim(),
        age: Number(editForm.age),
        consultation_facility: editForm.consultation_facility,
        appointment_date: editForm.appointment_date,
      }
      setSelectedAppointment(updated)
      setAppointments(prev => prev.map(a => (a.id === updated.id ? updated : a)))
      setEditing(false)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save changes.')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleExportCsv = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const all: Appointment[] = []
      let p = 1
      for (;;) {
        const params = new URLSearchParams({
          page: String(p),
          limit: '100',
          ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
          ...(facilityFilter ? { facility: facilityFilter } : {}),
          ...(dateFilter ? { date: dateFilter } : {}),
          ...(statusFilter ? { status: statusFilter } : {}),
        })
        const res = await fetch(`/api/appointments?${params.toString()}`, { credentials: 'same-origin' })
        if (!res.ok) throw new Error('Export failed.')
        const json = (await res.json()) as { data?: Appointment[]; total?: number }
        const rows = json.data ?? []
        all.push(...rows)
        if (rows.length < 100 || all.length >= (json.total ?? 0) || all.length >= 2000) break
        p += 1
      }
      const header = ['id', 'patient_name', 'age', 'consultation_facility', 'yakap_registered', 'yakap_facility', 'selected_tests', 'appointment_date', 'status', 'created_at']
      const lines = [header.join(',')]
      for (const a of all) {
        lines.push(
          [a.id, a.patient_name, a.age, a.consultation_facility, a.yakap_registered ? 'YES' : 'NO', a.yakap_facility ?? '', a.selected_tests.join('; '), a.appointment_date, a.status, a.created_at]
            .map(toCsvCell)
            .join(',')
        )
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `appointments-${dateFilter || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
      setError('CSV export failed. Please try again.')
    } finally {
      setExporting(false)
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
              fetchAppointments(page, debouncedSearch, facilityFilter, dateFilter, statusFilter)
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

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-700 disabled:opacity-60"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
          <button
            onClick={() => setShowQuotas(v => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 text-sm rounded-xl hover:bg-gray-50"
          >
            <BarChart3 className="w-4 h-4" />
            {showQuotas ? 'Hide Quotas' : 'Daily Quotas'}
          </button>
        </div>

        {/* Daily quotas */}
        {showQuotas && (
          <div className="bg-white rounded-2xl shadow p-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
              <label className="text-sm font-medium text-gray-700">Quota date</label>
              <input
                type="date"
                value={quotaDate}
                onChange={(e) => setQuotaDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-xl text-gray-900 bg-white"
              />
              {quotaLoading && <span className="text-sm text-gray-500">Loading…</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.values(TEST_CONFIG).map(t => {
                const booked = quotaCounts[t.label] ?? 0
                const pct = Math.min(100, Math.round((booked / t.limit) * 100))
                const full = booked >= t.limit
                return (
                  <div key={t.label} className={`p-3 rounded-xl border ${full ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-gray-900">{t.label}</span>
                      <span className={full ? 'text-red-700 font-semibold' : 'text-gray-600'}>{booked}/{t.limit}{full ? ' FULL' : ''}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full ${full ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Search and Filter */}
        <div className="bg-white rounded-2xl shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => { setPage(1); setDateFilter(e.target.value) }}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <select
                value={statusFilter}
                onChange={(e) => { setPage(1); setStatusFilter(e.target.value) }}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
              >
                <option value="">All Statuses</option>
                {APPOINTMENT_STATUSES.map(s => (
                  <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          {(dateFilter || statusFilter) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {dateFilter && (
                <button onClick={() => { setPage(1); setDateFilter('') }} className="text-xs px-3 py-1.5 bg-gray-100 rounded-full hover:bg-gray-200">
                  Date {dateFilter} ✕
                </button>
              )}
              {statusFilter && (
                <button onClick={() => { setPage(1); setStatusFilter('') }} className="text-xs px-3 py-1.5 bg-gray-100 rounded-full hover:bg-gray-200">
                  Status {statusFilter} ✕
                </button>
              )}
              <button
                onClick={() => { setPage(1); setDateFilter(todayLocal()) }}
                className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full hover:bg-blue-100"
              >
                Today
              </button>
            </div>
          )}
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
                  <span className="flex flex-col items-end gap-1">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      appointment.yakap_registered
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      YAKAP {appointment.yakap_registered ? 'YES' : 'NO'}
                    </span>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full capitalize ${STATUS_STYLES[appointment.status]}`}>
                      {appointment.status}
                    </span>
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
                    Status
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
                    <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
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
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full capitalize ${STATUS_STYLES[appointment.status]}`}>
                          {appointment.status}
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
                  <p className="text-xs text-gray-500 uppercase mb-1.5">Status</p>
                  <div className="flex flex-wrap gap-1.5">
                    {APPOINTMENT_STATUSES.map(s => (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(s)}
                        disabled={updatingStatus || selectedAppointment.status === s}
                        className={`px-3 py-1.5 text-xs font-medium rounded-full capitalize border disabled:opacity-60 ${
                          selectedAppointment.status === s
                            ? STATUS_STYLES[s] + ' border-transparent'
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  {updatingStatus && <p className="mt-1 text-xs text-gray-500">Updating…</p>}
                </div>

                <div>
                  <p className="text-xs text-gray-500 uppercase mb-1 flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5" /> Appointment ID
                  </p>
                  <p className="text-sm font-mono text-gray-900 break-all">{selectedAppointment.id}</p>
                </div>

                {editing ? (
                  <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                    <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                      <Pencil className="w-4 h-4" /> Edit appointment
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="text-sm text-gray-700">Patient name
                        <input value={editForm.patient_name} onChange={(e) => setEditForm(f => ({ ...f, patient_name: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-xl text-gray-900 bg-white" />
                      </label>
                      <label className="text-sm text-gray-700">Age
                        <input type="number" min={1} max={120} value={editForm.age} onChange={(e) => setEditForm(f => ({ ...f, age: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-xl text-gray-900 bg-white" />
                      </label>
                      <label className="text-sm text-gray-700">Facility
                        <select value={editForm.consultation_facility} onChange={(e) => setEditForm(f => ({ ...f, consultation_facility: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-xl text-gray-900 bg-white">
                          {HEALTH_FACILITIES.map(f => (<option key={f} value={f}>{f}</option>))}
                        </select>
                      </label>
                      <label className="text-sm text-gray-700">Date
                        <input type="date" value={editForm.appointment_date} onChange={(e) => setEditForm(f => ({ ...f, appointment_date: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-xl text-gray-900 bg-white" />
                      </label>
                    </div>
                    {editError && <p className="text-sm text-red-700">{editError}</p>}
                    <div className="flex gap-2">
                      <button onClick={handleSaveEdit} disabled={savingEdit} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-60 font-medium">
                        {savingEdit ? 'Saving...' : 'Save changes'}
                      </button>
                      <button onClick={() => setEditing(false)} disabled={savingEdit} className="flex-1 px-4 py-2.5 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 font-medium">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

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
                      onClick={openEdit}
                      className="flex-1 inline-flex items-center justify-center px-4 py-2.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl hover:bg-blue-100 font-medium"
                    >
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit
                    </button>
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