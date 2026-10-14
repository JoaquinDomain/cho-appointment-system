'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, AlertCircle, Calendar, Trash2 } from 'lucide-react'

function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const INPUT =
  'w-full px-3.5 py-2.5 border border-line rounded-xl text-ink placeholder:text-faint bg-white outline-none text-sm transition-all focus:border-brand focus:ring-2 focus:ring-brand/20'

const NOTE_MAX = 160

function prettyDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

type BlockedRow = { date: string; note: string; appointments: number }
type Candidate = { date: string; blocked: boolean; note: string; appointments: number }

export default function BlockedDatesModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<BlockedRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [candidateLoading, setCandidateLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')

  const loadList = useCallback(async () => {
    setListLoading(true)
    setListError('')
    try {
      const res = await fetch('/api/admin/blocked-dates', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      if (res.status === 401) throw new Error('Session expired. Please log in again.')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Failed to load blocked dates.')
      const list = (json as { blocked?: BlockedRow[] }).blocked
      setRows(Array.isArray(list) ? list : [])
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load blocked dates.')
    } finally {
      setListLoading(false)
    }
  }, [])

  const fetchCandidate = useCallback(async (target: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) {
      setCandidate(null)
      return
    }
    setCandidateLoading(true)
    try {
      const res = await fetch(`/api/admin/blocked-dates?date=${encodeURIComponent(target)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Failed to check that date.')
      if (json.date === target) setCandidate(json as Candidate)
    } catch {
      // the form still works without the preview; the server enforces the rule
      setCandidate(null)
    } finally {
      setCandidateLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadList()
  }, [loadList])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchCandidate(date)
  }, [date, fetchCandidate])

  const blockDate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!date) {
      setActionError('Pick a date to block.')
      return
    }
    if (note.trim().length > NOTE_MAX) {
      setActionError(`Note must be at most ${NOTE_MAX} characters.`)
      return
    }
    setSaving(true)
    setActionError('')
    setNotice('')
    try {
      const res = await fetch('/api/admin/blocked-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ date, note: note.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Failed to block the date.')
      const existing = Number((json as { appointments?: number }).appointments ?? 0)
      setNotice(
        existing > 0
          ? `Blocked ${prettyDate(date)}. ${existing} appointment${existing === 1 ? '' : 's'} already on that date were kept — cancel them one by one if needed.`
          : `Blocked ${prettyDate(date)}. New online bookings and walk-ins are refused.`
      )
      await loadList()
      await fetchCandidate(date)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to block the date.')
    } finally {
      setSaving(false)
    }
  }

  const unblock = async (target: string) => {
    setRemoving(target)
    setActionError('')
    setNotice('')
    try {
      const res = await fetch('/api/admin/blocked-dates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ date: target }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Failed to unblock the date.')
      setNotice(`Unblocked ${prettyDate(target)}. Patients can book it again.`)
      await loadList()
      if (date === target) await fetchCandidate(target)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to unblock the date.')
    } finally {
      setRemoving('')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-navy/50 p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-page">
          <h2 className="inline-flex items-center gap-2 text-base font-bold text-navy">
            <Calendar className="w-5 h-5 text-brand" />
            Block a Date
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-line/60 rounded-full transition-colors" aria-label="Close">
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        <form onSubmit={blockDate} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <p className="text-sm text-muted">
            A blocked date takes no new patients: online booking and walk-in registration are both
            refused. Appointments already on that date stay as they are.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="block-date" className="block text-sm font-semibold text-navy mb-1">
                Date *
              </label>
              <input
                id="block-date"
                required
                type="date"
                value={date}
                min={todayLocal()}
                onChange={(e) => setDate(e.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="block-note" className="block text-sm font-semibold text-navy mb-1">
                Reason shown to patients
              </label>
              <input
                id="block-note"
                value={note}
                maxLength={NOTE_MAX}
                onChange={(e) => setNote(e.target.value)}
                className={INPUT}
                placeholder="e.g. Lab closed for inventory"
              />
              <p className="mt-1 text-[11px] text-faint tabular-nums">{note.length}/{NOTE_MAX}</p>
            </div>
          </div>

          {candidateLoading && (
            <p className="flex items-center gap-2 text-xs text-muted">
              <span className="w-3.5 h-3.5 border-2 border-brand/30 border-t-brand rounded-full animate-spin" aria-hidden="true" />
              Checking that date…
            </p>
          )}
          {candidate?.blocked && (
            <div className="flex gap-2 p-3 bg-warn-surface border border-warn/30 rounded-xl" role="status">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-warn" />
              <p className="text-sm text-warn">
                {prettyDate(candidate.date)} is already blocked
                {candidate.note ? ` (${candidate.note})` : ''}. Blocking again just updates the reason.
              </p>
            </div>
          )}
          {candidate && !candidate.blocked && candidate.appointments > 0 && (
            <div className="flex gap-2 p-3 bg-warn-surface border border-warn/30 rounded-xl" role="status">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-warn" />
              <p className="text-sm text-warn">
                {candidate.appointments} appointment{candidate.appointments === 1 ? '' : 's'} already on{' '}
                {prettyDate(candidate.date)}. They will not be cancelled — only new bookings are refused.
              </p>
            </div>
          )}

          {actionError && (
            <div className="flex gap-2 p-3 bg-danger-surface border border-danger/30 rounded-xl" role="alert">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-danger" />
              <p className="text-sm text-danger">{actionError}</p>
            </div>
          )}
          {notice && (
            <div className="p-3 bg-ok-surface border border-ok/30 rounded-xl" role="status">
              <p className="text-sm text-ok">{notice}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={saving || candidateLoading || !date}
            className="w-full px-6 py-3.5 min-h-[48px] bg-brand text-white rounded-xl hover:bg-brand-dark font-bold disabled:bg-disabled disabled:text-disabled-text disabled:cursor-not-allowed transition-colors shadow-md shadow-brand/20"
          >
            {saving ? 'Saving…' : candidate?.blocked ? 'Update Blocked Date' : 'Block This Date'}
          </button>

          <div className="pt-2 border-t border-line">
            <h3 className="text-sm font-bold text-navy mb-2">Currently blocked</h3>
            {listLoading && (
              <p className="flex items-center gap-2 text-sm text-muted">
                <span className="w-3.5 h-3.5 border-2 border-brand/30 border-t-brand rounded-full animate-spin" aria-hidden="true" />
                Loading…
              </p>
            )}
            {listError && <p className="text-sm text-danger">{listError}</p>}
            {!listLoading && !listError && rows.length === 0 && (
              <p className="text-sm text-muted">No dates are blocked.</p>
            )}
            <ul className="space-y-2">
              {rows.map((row) => (
                <li
                  key={row.date}
                  className="flex items-center gap-3 p-2.5 rounded-xl border border-line bg-white"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-navy">{prettyDate(row.date)}</p>
                    <p className="text-xs text-muted truncate">
                      {row.note || 'No reason given'}
                      {row.appointments > 0 &&
                        ` · ${row.appointments} appointment${row.appointments === 1 ? '' : 's'} kept`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void unblock(row.date)}
                    disabled={removing === row.date}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-danger bg-danger-surface border border-danger/20 rounded-lg hover:bg-danger/10 disabled:opacity-60 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {removing === row.date ? 'Removing…' : 'Unblock'}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-faint">
              Weekends and Philippine holidays are always closed and never need to be listed here.
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
