'use client'

import { useState } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { holidayName, isWeekend } from '@/lib/dates/holidays'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

function toISO(y: number, m0: number, d: number): string {
  return `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseISO(iso: string): { y: number; m0: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  return { y: Number(m[1]), m0: Number(m[2]) - 1, d: Number(m[3]) }
}

function toDisplay(iso: string): string {
  const p = parseISO(iso)
  if (!p) return ''
  return `${String(p.m0 + 1).padStart(2, '0')}/${String(p.d).padStart(2, '0')}/${p.y}`
}

export default function DatePicker({
  value,
  min,
  max,
  onChange,
  blocked = {},
}: {
  value: string // YYYY-MM-DD or ''
  min: string // YYYY-MM-DD
  max: string // YYYY-MM-DD
  onChange: (iso: string) => void
  // dates an admin closed to new bookings: YYYY-MM-DD -> note ('' if none)
  blocked?: Record<string, string>
}) {
  const now = new Date()
  const fallback = { y: now.getFullYear(), m0: now.getMonth() }
  const sel = value ? parseISO(value) : null
  const [view, setView] = useState<{ y: number; m0: number }>(
    sel ? { y: sel.y, m0: sel.m0 } : fallback
  )
  const viewKey = view.y * 12 + view.m0
  const minP = parseISO(min)
  const maxP = parseISO(max)
  const minKey = minP ? minP.y * 12 + minP.m0 : -Infinity
  const maxKey = maxP ? maxP.y * 12 + maxP.m0 : Infinity

  const move = (dir: 1 | -1) => {
    const next = viewKey + dir
    if (next < minKey || next > maxKey) return
    const y = Math.floor(next / 12)
    setView({ y, m0: next - y * 12 })
  }

  const leadBlanks = new Date(view.y, view.m0, 1).getDay()
  const daysInMonth = new Date(view.y, view.m0 + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array<null>(leadBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
          <CalendarIcon className="w-5 h-5 text-emerald-600" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-slate-900 leading-tight">
            Appointment date <span className="text-red-500">*</span>
          </p>
          <p className="text-xs text-slate-500 truncate">
            Weekdays only · 8:00 AM onwards · PH holidays excluded.
          </p>
        </div>
      </div>

      <p className="text-sm font-bold text-slate-800 mt-4 mb-1.5">Choose your preferred date</p>
      <div className="relative">
        <input
          type="text"
          readOnly
          value={value ? toDisplay(value) : ''}
          placeholder="mm/dd/yyyy"
          aria-label="Selected appointment date"
          onClick={() => {
            if (sel) setView({ y: sel.y, m0: sel.m0 })
          }}
          className="w-full px-4 py-3 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 bg-white shadow-sm outline-none transition focus:ring-2 focus:ring-sky-500 focus:border-sky-500 cursor-default"
        />
        <CalendarIcon className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-900 pointer-events-none" />
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white shadow-sm p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => move(-1)}
            disabled={viewKey <= minKey}
            aria-label="Previous month"
            className="p-1.5 rounded-lg text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <p className="text-[15px] font-bold text-slate-900">
            {MONTHS[view.m0]} {view.y}
          </p>
          <button
            type="button"
            onClick={() => move(1)}
            disabled={viewKey >= maxKey}
            aria-label="Next month"
            className="p-1.5 rounded-lg text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label={`${MONTHS[view.m0]} ${view.y}`}>
          {DOW.map(d => (
            <span key={d} className="text-center text-xs font-bold text-slate-400 py-1">
              {d}
            </span>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <span key={`blank-${i}`} />
            const iso = toISO(view.y, view.m0, day)
            const outOfRange = iso < min || iso > max
            const weekend = isWeekend(iso)
            const holiday = holidayName(iso)
            const blockNote = Object.prototype.hasOwnProperty.call(blocked, iso) ? blocked[iso] : null
            const blockedDay = blockNote !== null
            const disabled = outOfRange || weekend || holiday !== null || blockedDay
            const selected = value === iso
            const blockTitle = blockedDay
              ? blockNote
                ? `Closed: ${blockNote}`
                : 'Closed — no bookings on this date'
              : null
            return (
              <button
                key={iso}
                type="button"
                role="gridcell"
                aria-selected={selected}
                disabled={disabled}
                title={blockTitle ?? holiday ?? (weekend ? 'Weekend — lab closed' : undefined)}
                onClick={() => onChange(iso)}
                className={`py-2 rounded-xl border text-[15px] tabular-nums transition-all ${
                  selected
                    ? 'bg-emerald-600 border-emerald-600 text-white font-bold shadow'
                    : blockedDay
                      ? 'bg-rose-100 border-rose-200 text-rose-600 font-bold cursor-not-allowed'
                      : holiday
                        ? 'bg-amber-100 border-amber-200 text-amber-700 font-bold cursor-not-allowed'
                        : disabled
                          ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-white border-slate-200 text-slate-900 hover:border-emerald-500 hover:bg-emerald-50 font-medium'
                }`}
              >
                {day}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-slate-100 border border-slate-200" />
            Weekend
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-amber-100 border border-amber-200" />
            PH holiday
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-rose-100 border border-rose-200" />
            Closed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-600" />
            Selected
          </span>
        </div>
      </div>
    </div>
  )
}
