'use client'

import { useState } from 'react'
import { X, AlertCircle, UserPlus } from 'lucide-react'
import { HEALTH_FACILITIES, TEST_CONFIG, isOnlineOnly, unavailableDateReason } from '@/lib/types'

function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const INPUT =
  'w-full px-3.5 py-2.5 border border-line rounded-xl text-ink placeholder:text-faint bg-white outline-none text-sm transition-all focus:border-brand focus:ring-2 focus:ring-brand/20'

export default function WalkinModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [contactNumber, setContactNumber] = useState('')
  const [facility, setFacility] = useState('')
  const [yakap, setYakap] = useState(false)
  const [yakapFacility, setYakapFacility] = useState('')
  const [tests, setTests] = useState<string[]>([])
  const [date, setDate] = useState(() => todayLocal())
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [createdId, setCreatedId] = useState('')

  // same closed-day rule as online booking
  const closedDayReason = date ? unavailableDateReason(date) : null

  const toggleTest = (label: string) => {
    setTests(prev => (prev.includes(label) ? prev.filter(t => t !== label) : [...prev, label]))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (closedDayReason) {
      setError(`${closedDayReason} Please choose another day.`)
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/admin/walkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          last_name: lastName.trim(),
          first_name: firstName.trim(),
          middle_name: middleName.trim(),
          birthdate,
          contact_number: contactNumber.trim(),
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
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-navy/50 p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-page">
          <h2 className="inline-flex items-center gap-2 text-base font-bold text-navy">
            <UserPlus className="w-5 h-5 text-brand" />
            Register Walk-in Patient
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-line/60 rounded-full transition-colors" aria-label="Close">
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        {createdId ? (
          <div className="p-6 text-center">
            <p className="text-lg font-bold text-navy">Walk-in registered</p>
            <p className="text-sm text-muted mt-1">Appointment ID</p>
            <p className="font-mono font-bold text-ink break-all mt-1">{createdId}</p>
            <button
              onClick={onClose}
              className="mt-5 px-6 py-2.5 bg-brand text-white rounded-xl hover:bg-brand-dark font-semibold transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-navy mb-1">Last Name *</label>
                <input required value={lastName} onChange={e => setLastName(e.target.value)} className={INPUT} placeholder="Cruz" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-navy mb-1">First Name *</label>
                <input required value={firstName} onChange={e => setFirstName(e.target.value)} className={INPUT} placeholder="Juan" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-navy mb-1">Middle Name</label>
                <input value={middleName} onChange={e => setMiddleName(e.target.value)} className={INPUT} placeholder="Optional" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-navy mb-1">Birthday *</label>
                <input required type="date" value={birthdate} max={todayLocal()} onChange={e => setBirthdate(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-navy mb-1">Consultation Facility *</label>
                <select required value={facility} onChange={e => setFacility(e.target.value)} className={`${INPUT} ${facility ? '' : 'text-faint'}`}>
                  <option value="">Select facility</option>
                  {HEALTH_FACILITIES.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-navy mb-1">Date *</label>
                <input required type="date" value={date} onChange={e => setDate(e.target.value)} className={INPUT} />
                {closedDayReason && (
                  <p className="mt-1.5 text-xs font-semibold text-danger">{closedDayReason}</p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1">Contact Number *</label>
              <input required type="tel" value={contactNumber} onChange={e => setContactNumber(e.target.value)} className={INPUT} placeholder="e.g. 0917 123 4567" />
            </div>

            <div className="flex items-center gap-2">
              <input id="walkin-yakap" type="checkbox" checked={yakap} onChange={e => setYakap(e.target.checked)} className="w-4 h-4 accent-brand" />
              <label htmlFor="walkin-yakap" className="text-sm font-medium text-ink">YAKAP registered</label>
            </div>
            {yakap && (
              <select required value={yakapFacility} onChange={e => setYakapFacility(e.target.value)} className={`${INPUT} ${yakapFacility ? '' : 'text-faint'}`}>
                <option value="">Select YAKAP facility</option>
                {HEALTH_FACILITIES.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            )}

            <div>
              <label className="block text-sm font-semibold text-navy mb-1">Tests * ({tests.length} selected)</label>
              <input type="search" value={search} onChange={e => setSearch(e.target.value)} className={INPUT} placeholder="Search tests..." aria-label="Search tests" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2 max-h-56 overflow-y-auto border border-line rounded-xl p-2">
                {filtered.map(c => {
                  const blocked = isOnlineOnly(c.label)
                  return (
                  <label key={c.label} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-ink ${blocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-soft cursor-pointer'}`}>
                    <input type="checkbox" checked={tests.includes(c.label)} disabled={blocked} onChange={() => toggleTest(c.label)} className="w-4 h-4 accent-brand disabled:cursor-not-allowed" />
                    <span className="truncate">{c.label}</span>
                    <span className="ml-auto text-[11px] text-faint tabular-nums">{blocked ? 'online only' : `cap ${c.limit}`}</span>
                  </label>
                  )
                })}
                {filtered.length === 0 && <p className="text-sm text-muted p-2">No tests match.</p>}
              </div>
            </div>

            {error && (
              <div className="flex gap-2 p-3 bg-danger-surface border border-danger/30 rounded-xl" role="alert">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-danger" />
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || tests.length === 0 || Boolean(closedDayReason)}
              className="w-full px-6 py-3.5 min-h-[48px] bg-brand text-white rounded-xl hover:bg-brand-dark font-bold disabled:bg-disabled disabled:text-disabled-text disabled:cursor-not-allowed transition-colors shadow-md shadow-brand/20"
            >
              {submitting ? 'Registering…' : 'Register Walk-in (Confirmed)'}
            </button>
            <p className="text-[11px] text-faint text-center">Walk-ins use the held-back half of daily capacity and are marked Confirmed.</p>
          </form>
        )}
      </div>
    </div>
  )
}
