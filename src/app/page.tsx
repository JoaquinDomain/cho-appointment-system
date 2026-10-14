import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { HeartPulse, Clock, MapPin, LockKeyhole } from 'lucide-react'
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
      <div className="bg-white border-b border-line">
        <div className="max-w-[800px] mx-auto px-4 sm:px-6 h-16 sm:h-[72px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Image
              src="/cho-logo.png"
              alt=""
              aria-hidden="true"
              width={44}
              height={44}
              className="w-9 sm:w-11 h-auto shrink-0"
            />
            <div className="min-w-0 leading-tight">
              <p className="text-[13px] sm:text-[15px] font-bold text-navy truncate">
                City Health Office
              </p>
              <p className="text-[11px] sm:text-xs text-muted">Bacolod City</p>
            </div>
          </div>
          <Link
            href="/admin"
            className="shrink-0 inline-flex items-center gap-1.5 text-[12px] sm:text-[13px] font-semibold text-brand hover:text-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 rounded-lg px-2 sm:px-3 py-2 transition-colors"
            title="CHO staff login"
          >
            <LockKeyhole className="w-3.5 h-3.5" />
            Staff login
          </Link>
        </div>
      </div>

      <header className="relative overflow-hidden bg-gradient-to-b from-hero to-navy text-white">
        <div className="absolute inset-0 bg-dot-grid opacity-70" aria-hidden="true" />
        <div
          className="absolute inset-x-0 bottom-0 h-[132px] sm:h-[176px] bg-skyline pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative max-w-[800px] mx-auto px-5 sm:px-6 pt-7 sm:pt-10 pb-16 sm:pb-20 text-center">
          <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur border border-white/25 flex items-center justify-center mb-3.5 sm:mb-4 shadow-lg">
            <HeartPulse className="w-6 h-6 sm:w-8 sm:h-8" />
          </div>
          <h1 className="text-[28px] sm:text-[36px] lg:text-[44px] font-extrabold leading-[1.15] tracking-tight text-balance drop-shadow-sm">
            CHO Laboratory Appointment System
          </h1>
          <p className="mt-3 sm:mt-4 text-[14px] sm:text-base text-white/85 text-pretty">
            Book your laboratory appointment online.
          </p>
          <div className="mt-4 sm:mt-5 flex justify-center">
            <span className="inline-flex items-center gap-1.5 text-[12px] sm:text-[13px] font-medium bg-white/15 backdrop-blur border border-white/20 rounded-full px-4 py-2">
              <Clock className="w-4 h-4 text-white/85" /> Lab opens 8:00 AM
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-[800px] mx-auto px-4 sm:px-6 -mt-7 sm:-mt-9 pb-10">
        <div className="animate-fade-up">
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
