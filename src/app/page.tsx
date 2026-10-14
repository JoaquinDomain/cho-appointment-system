import Link from 'next/link'
import { redirect } from 'next/navigation'
import { HeartPulse, Clock, MapPin, LockKeyhole, CalendarDays, ArrowRight, Info } from 'lucide-react'
import SiteHeader from '@/components/SiteHeader'
import AppointmentForm from '@/components/AppointmentForm'
import { isAdminSite } from '@/lib/appMode'

// The calendar and birthday limits derive from "today". Render per request so
// the served HTML always carries current dates — a statically-prerendered copy
// goes stale and its calendar grid no longer matches what the browser computes,
// which breaks hydration of the date picker.
export const dynamic = 'force-dynamic'

const FEATURES = [
  { icon: CalendarDays, label: 'Easy Booking' },
  { icon: Clock, label: 'Shorter Waiting Time' },
  { icon: LockKeyhole, label: 'Secure and Private' },
]

export default function Home() {
  if (isAdminSite) {
    redirect('/admin')
  }

  return (
    <div className="min-h-screen bg-page text-ink">
      <SiteHeader />

      <header className="relative overflow-hidden bg-gradient-to-b from-hero to-navy text-white">
        <div className="absolute inset-0 bg-dot-grid opacity-70" aria-hidden="true" />
        <div
          className="absolute inset-x-0 bottom-0 h-[132px] sm:h-[176px] bg-skyline pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative max-w-[800px] mx-auto px-5 sm:px-6 pt-8 sm:pt-12 pb-20 sm:pb-24 text-left">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur border border-white/25 flex items-center justify-center mb-4 shadow-lg">
            <HeartPulse className="w-6 h-6 sm:w-8 sm:h-8" />
          </div>
          <h1 className="text-[28px] sm:text-[36px] lg:text-[44px] font-extrabold leading-[1.12] tracking-tight text-balance drop-shadow-sm">
            CHO Laboratory Appointment System
          </h1>
          <p className="mt-3 sm:mt-4 text-[14px] sm:text-base text-white/85 max-w-xl text-pretty">
            Book your laboratory visit online quickly and easily.
          </p>
          <div className="mt-4 sm:mt-5">
            <span className="inline-flex items-center gap-1.5 text-[12px] sm:text-[13px] font-medium bg-white/15 backdrop-blur border border-white/20 rounded-full px-4 py-2">
              <Clock className="w-4 h-4 text-white/85" /> Lab opens 8:00 AM
            </span>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-[800px] mx-auto px-4 sm:px-6 -mt-8 sm:-mt-10 pb-10">
        <section className="bg-white rounded-3xl border border-line shadow-xl shadow-navy/10 p-5 sm:p-6">
          <ul className="grid grid-cols-3 gap-2 sm:gap-4">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex flex-col items-center text-center gap-2">
                <span className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-soft border border-line flex items-center justify-center">
                  <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-brand" aria-hidden="true" />
                </span>
                <span className="text-[11px] sm:text-[13px] font-semibold text-navy leading-tight">
                  {label}
                </span>
              </li>
            ))}
          </ul>
          <a
            href="#book"
            className="mt-5 w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 min-h-[48px] bg-brand text-white rounded-xl font-bold text-base hover:bg-brand-dark transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
          >
            Book an Appointment
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </a>
        </section>

        <div className="mt-4 flex gap-2.5 p-3.5 bg-soft border border-line rounded-2xl">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-brand" aria-hidden="true" />
          <p className="text-[13px] leading-relaxed text-ink">
            For laboratory services, please arrive on your scheduled date and time.
          </p>
        </div>

        <div id="book" className="mt-5 scroll-mt-4 animate-fade-up">
          <AppointmentForm />
        </div>
      </main>

      <footer className="max-w-[800px] mx-auto px-4 sm:px-6 pb-10 pt-6 border-t border-line text-center">
        <p className="inline-flex items-center gap-1.5 text-[13px] text-muted">
          <MapPin className="w-4 h-4 shrink-0" />
          City Health Office &middot; Bacolod City &middot; Laboratory opens 8:00 AM
        </p>
        <div className="mt-3 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-5">
          <Link
            href="/privacy-policy"
            className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-brand transition-colors py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 rounded-md"
          >
            Privacy Policy
          </Link>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-brand transition-colors py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 rounded-md"
            title="CHO staff login"
          >
            <LockKeyhole className="w-3.5 h-3.5" />
            CHO Staff Login
          </Link>
        </div>
      </footer>
    </div>
  )
}
