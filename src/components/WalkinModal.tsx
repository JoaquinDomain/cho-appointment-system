'use client'

import { useState } from 'react'
import { X, AlertCircle, UserPlus } from 'lucide-react'
import { HEALTH_FACILITIES, TEST_CONFIG } from '@/lib/types'

function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const INPUT =
  'w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 bg-white shadow-sm outline-none text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500'

export default function WalkinModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [fullName, setFullName] = useState('')
  const [age, setAge] = useState('')
  const [facility, setFacility] = useState('')
  const [yakap, setYakap] = useState(false)
  const [yakapFacility, setYakapFacility] = useState('')
  const [tests, setTests] = useState<string[]>([])
  const [date, setDate] = useState(() => todayLocal())
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [createdId, setCreatedId] = useState('')

  const toggleTest = (label: string) => {
    setTests(prev => (prev.includes(label) ? prev.filter(t => t !== label) : [...prev, label]))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/admin/walkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          patient_name: fullName.trim(),
          age,
          consultation_facility: facility,
          yakap_registered: yakap,
          yakap_facility: yakap ? yakapFacility : null,
          selected_tests: tests,
          appointment_date: date,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const details = Array.isArray((json as { details?: string[] }).details)
          ? `: ${(json as { details: string[] }).details.slice(0, 2).join(' ')}`
          : ''
        throw new Error(`${(json as { error?: string }).error ?? 'Registration failed.'}${details}`)
      }
      setCreatedId((json as { id: string }).id)
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const filtered = Object.values(TEST_CONFIG).filter(c =>
    c.label.toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-950/60 p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
          <h2 className="inline-flex items-center gap-2 text-base font-bold text-slate-900">
            <UserPlus className="w-5 h-5 text-sky-700" />
            Register Walk-in Patient
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full" aria-label="Close">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {createdId ? (
          <div className="p-6 text-center">
            <p className="text-lg font-bold text-slate-900">Walk-in registered</p>
            <p className="text-sm text-slate-500 mt-1">Appointment ID</p>
            <p className="font-mono font-bold text-slate-900 break-all mt-1">{createdId}</p>
            <button
              onClick={onClose}
              className="mt-5 px-6 py-2.5 bg-sky-950 text-white rounded-xl hover:bg-sky-900 font-semibold"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name *</label>
                <input required value={fullName} onChange={e => setFullName(e.target.value)} className={INPUT} placeholder="Juan D. Cruz" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Age *</label>
                <input required type="number" min={1} max={120} value={age} onChange={e => setAge(e.target.value)} className={INPUT} placeholder="e.g. 34" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Consultation Facility *</label>
                <select required value={facility} onChange={e => setFacility(e.target.value)} className={`${INPUT} ${facility ? '' : 'text-slate-400'}`}>
                  <option value="">Select facility</option>
                  {HEALTH_FACILITIES.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Date *</label>
                <input required type="date" value={date} onChange={e => setDate(e.target.value)} className={INPUT} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input id="walkin-yakap" type="checkbox" checked={yakap} onChange={e => setYakap(e.target.checked)} className="w-4 h-4 accent-sky-700" />
              <label htmlFor="walkin-yakap" className="text-sm font-medium text-slate-700">YAKAP registered</label>
            </div>
            {yakap && (
              <select required value={yakapFacility} onChange={e => setYakapFacility(e.target.value)} className={`${INPUT} ${yakapFacility ? '' : 'text-slate-400'}`}>
                <option value="">Select YAKAP facility</option>
                {HEALTH_FACILITIES.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Tests * ({tests.length} selected)</label>
              <input type="search" value={search} onChange={e => setSearch(e.target.value)} className={INPUT} placeholder="Search tests..." aria-label="Search tests" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2 max-h-56 overflow-y-auto border border-slate-200 rounded-xl p-2">
                {filtered.map(c => (
                  <label key={c.label} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sky-50 cursor-pointer text-sm text-slate-700">
                    <input type="checkbox" checked={tests.includes(c.label)} onChange={() => toggleTest(c.label)} className="w-4 h-4 accent-sky-700" />
                    <span className="truncate">{c.label}</span>
                    <span className="ml-auto text-[11px] text-slate-400 tabular-nums">cap {c.limit}</span>
                  </label>
                ))}
                {filtered.length === 0 && <p className="text-sm text-slate-400 p-2">No tests match.</p>}
              </div>
            </div>

            {error && (
              <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-xl" role="alert">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || tests.length === 0}
              className="w-full px-6 py-3.5 bg-sky-950 text-white rounded-xl hover:bg-sky-900 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Registering...' : 'Register Walk-in (Confirmed)'}
            </button>
            <p className="text-[11px] text-slate-400 text-center">Walk-ins use the held-back half of daily capacity and are marked Confirmed.</p>
          </form>
        )}
      </div>
    </div>
  )
}
