'use client'

import { useState } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { holidayName, isWeekend } from '@/lib/dates/holidays'
import { useHydrated } from '@/lib/useHydrated'

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
  const todayISO = toISO(now.getFullYear(), now.getMonth(), now.getDate())
  const sel = value ? parseISO(value) : null
  const hydrated = useHydrated()
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
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-soft border border-line flex items-center justify-center shrink-0 shadow-sm">
          <CalendarIcon className="w-5 h-5 text-brand" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-navy leading-tight">
            Appointment date <span className="text-danger">*</span>
          </p>
          <p className="text-xs text-muted truncate">
            Weekdays only · 8:00 AM onwards · PH holidays excluded.
          </p>
        </div>
      </div>

      <p className="text-sm font-bold text-navy mt-4 mb-2">Choose your preferred date</p>
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
          className="w-full px-4 py-3.5 border border-line rounded-xl text-ink placeholder:text-faint bg-white outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/20 text-base cursor-default"
        />
        <CalendarIcon className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
      </div>

      <div className={`mt-4 rounded-2xl border border-line bg-white shadow-sm shadow-navy/5 p-3 sm:p-5 transition-opacity ${hydrated ? '' : 'opacity-60'}`}>
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <button
            type="button"
            onClick={() => move(-1)}
            disabled={!hydrated || viewKey <= minKey}
            aria-label="Previous month"
            className="p-2 rounded-xl text-ink hover:bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <p className="text-[15px] sm:text-[16px] font-bold text-navy">
            {MONTHS[view.m0]} {view.y}
          </p>
          <button
            type="button"
            onClick={() => move(1)}
            disabled={!hydrated || viewKey >= maxKey}
            aria-label="Next month"
            className="p-2 rounded-xl text-ink hover:bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 min-[380px]:gap-1.5 sm:gap-2" role="grid" aria-label={`${MONTHS[view.m0]} ${view.y}`}>
          {DOW.map(d => (
            <span key={d} className="text-center text-[11px] sm:text-xs font-bold text-faint py-1.5">
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
            const isToday = iso === todayISO
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
                disabled={!hydrated || disabled}
                title={blockTitle ?? holiday ?? (weekend ? 'Weekend — lab closed' : undefined)}
                onClick={() => onChange(iso)}
                className={`py-2.5 sm:py-3 min-h-[40px] rounded-xl border text-sm sm:text-[15px] tabular-nums transition-colors ${
                  selected
                    ? 'bg-brand border-brand text-white font-bold shadow-sm shadow-brand/30'
                    : blockedDay
                      ? 'bg-danger-surface border-danger/30 text-danger font-bold cursor-not-allowed'
                      : holiday
                        ? 'bg-warn-surface border-warn/30 text-warn font-bold cursor-not-allowed'
                        : disabled
                          ? 'bg-disabled border-line text-disabled-text cursor-not-allowed'
                          : `bg-white border-line text-ink hover:border-brand hover:bg-soft font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40${isToday ? ' font-bold border-brand/50' : ''}`
                }`}
              >
                {day}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-line text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-disabled border-line" />
            Weekend
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-warn-surface border border-warn/30" />
            PH holiday
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-danger-surface border border-danger/30" />
            Closed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-brand" />
            Selected
          </span>
        </div>
      </div>
    </div>
  )
}
