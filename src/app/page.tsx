import { redirect } from 'next/navigation'
import { HeartPulse, MapPin, Info } from 'lucide-react'
import SiteHeader from '@/components/SiteHeader'
import AppointmentForm from '@/components/AppointmentForm'
import { isAdminSite } from '@/lib/appMode'

// The calendar and birthday limits derive from "today". Render per request so
// the served HTML always carries current dates — a statically-prerendered copy
// goes stale and its calendar grid no longer matches what the browser computes,
// which breaks hydration of the date picker.
export const dynamic = 'force-dynamic'

export default function Home() {
  if (isAdminSite) {
    redirect('/admin')
  }

  return (
    <div className="min-h-screen bg-page text-ink">
      <SiteHeader />

      <header className="relative overflow-hidden bg-gradient-to-br from-hero via-hero-teal to-accent text-white">
        <div className="absolute inset-0 bg-dot-grid opacity-40" aria-hidden="true" />
        <div
          className="absolute inset-x-0 bottom-0 h-[140px] sm:h-[180px] bg-skyline pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative max-w-[800px] mx-auto px-5 sm:px-6 pt-10 sm:pt-14 pb-12 sm:pb-16 text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-2xl bg-white/20 backdrop-blur-xl border border-white/30 flex items-center justify-center mb-5 shadow-lg shadow-navy/10">
            <HeartPulse className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <h1 className="text-[28px] sm:text-[36px] lg:text-[42px] font-extrabold leading-[1.12] tracking-tight text-balance drop-shadow-lg">
            CHO Laboratory Appointment System
          </h1>
        </div>
      </header>

      <main className="relative z-10 max-w-[800px] mx-auto px-4 sm:px-6 pb-12 pt-6">
        <div className="flex gap-3 p-4 bg-white border border-line rounded-2xl shadow-sm shadow-navy/5">
          <Info className="w-5 h-5 mt-0.5 shrink-0 text-brand" aria-hidden="true" />
          <p className="text-[14px] leading-relaxed text-ink">
            For laboratory services, please arrive on your scheduled date and time.
          </p>
        </div>

        <div className="mt-6 animate-fade-up">
          <AppointmentForm />
        </div>
      </main>

      <footer className="max-w-[800px] mx-auto px-4 sm:px-6 pb-10 pt-6 border-t border-line text-center">
        <p className="inline-flex items-center gap-1.5 text-[13px] text-muted">
          <MapPin className="w-4 h-4 shrink-0" />
          City Health Office &middot; Bacolod City
        </p>
      </footer>
    </div>
  )
}
