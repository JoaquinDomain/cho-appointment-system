import { redirect } from 'next/navigation'
import { HeartPulse, Clock, MapPin, CalendarCheck, FlaskConical, QrCode } from 'lucide-react'
import AppointmentForm from '@/components/AppointmentForm'
import { isAdminSite } from '@/lib/appMode'

const STEPS = [
  { icon: CalendarCheck, label: 'Pick a date' },
  { icon: FlaskConical, label: 'Choose tests' },
  { icon: QrCode, label: 'Show your QR' },
]

export default function Home() {
  if (isAdminSite) {
    redirect('/admin')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="relative overflow-hidden bg-gradient-to-br from-sky-950 via-sky-800 to-cyan-700 text-white">
        <div className="absolute inset-0 bg-dot-grid" />
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-cyan-400/25 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-16 w-80 h-80 bg-blue-500/25 rounded-full blur-3xl" />

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-10 sm:pb-12 text-center">
          <p className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200 bg-white/10 border border-white/15 rounded-full px-3.5 py-1.5">
            City Health Office &middot; Bacolod City
          </p>
          <div className="mx-auto w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-white/15 backdrop-blur border border-white/20 flex items-center justify-center mt-5 mb-4 shadow-xl animate-float">
            <HeartPulse className="w-8 h-8 sm:w-10 sm:h-10" />
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-2 drop-shadow-sm text-balance">
            CHO Laboratory{' '}
            <span className="bg-gradient-to-r from-cyan-200 to-white bg-clip-text text-transparent">
              Appointment System
            </span>
          </h1>
          <div className="mt-6 flex justify-center items-center text-xs sm:text-sm">
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur border border-white/20 rounded-full px-4 py-2 shadow">
              <Clock className="w-4 h-4 text-cyan-200" /> Lab opens 8:00 AM
            </span>
          </div>

          <ol className="mt-7 flex items-stretch justify-center gap-2 sm:gap-3 text-left">
            {STEPS.map((s, i) => (
              <li
                key={s.label}
                className="flex-1 sm:flex-none flex items-center gap-2.5 bg-white/10 backdrop-blur border border-white/15 rounded-2xl px-3 sm:px-4 py-2.5"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-[11px] font-bold">
                    {i + 1}
                  </span>
                  <s.icon className="w-4 h-4 shrink-0 text-cyan-200" />
                  <span className="text-xs sm:text-sm font-medium truncate">{s.label}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 -mt-5 pb-12">
        <div className="animate-fade-up">
          <AppointmentForm />
        </div>
      </main>

      <footer className="pb-10 text-center">
        <p className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <MapPin className="w-3.5 h-3.5" />
          City Health Office &middot; Bacolod City &middot; Laboratory opens 8:00 AM
        </p>
      </footer>
    </div>
  )
}
