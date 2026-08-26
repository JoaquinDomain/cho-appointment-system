import { redirect } from 'next/navigation'
import { HeartPulse, FlaskConical, Clock, ShieldCheck, MapPin } from 'lucide-react'
import AppointmentForm from '@/components/AppointmentForm'
import { isAdminSite } from '@/lib/appMode'

export default function Home() {
  if (isAdminSite) {
    redirect('/admin')
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-100 via-blue-50 to-white">
      <header className="relative overflow-hidden bg-gradient-to-br from-blue-800 via-blue-600 to-cyan-500 text-white">
        <div className="absolute inset-0 bg-dot-grid" />
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-cyan-400/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-16 w-80 h-80 bg-indigo-500/30 rounded-full blur-3xl" />

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 text-center">
          <div className="mx-auto w-20 h-20 rounded-3xl bg-white/15 backdrop-blur border border-white/20 flex items-center justify-center mb-5 shadow-xl animate-float">
            <HeartPulse className="w-10 h-10" />
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-3 drop-shadow-sm">
            CHO Laboratory{' '}
            <span className="bg-gradient-to-r from-cyan-200 to-white bg-clip-text text-transparent">
              Appointment System
            </span>
          </h1>
          <p className="text-blue-100 text-sm sm:text-lg">
            City Health Office &middot; Bacolod City
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-2.5 text-xs sm:text-sm">
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur border border-white/20 rounded-full px-4 py-2 shadow">
              <FlaskConical className="w-4 h-4 text-cyan-200" /> Book lab tests online
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur border border-white/20 rounded-full px-4 py-2 shadow">
              <Clock className="w-4 h-4 text-cyan-200" /> Lab opens 8:00 AM
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur border border-white/20 rounded-full px-4 py-2 shadow">
              <ShieldCheck className="w-4 h-4 text-cyan-200" /> Free &amp; secure booking
            </span>
          </div>
        </div>

        <svg
          className="relative block w-full text-sky-100"
          viewBox="0 0 1440 64"
          preserveAspectRatio="none"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M0,32 C240,64 480,0 720,16 C960,32 1200,64 1440,32 L1440,64 L0,64 Z" />
        </svg>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 -mt-2 pb-12">
        <div className="animate-fade-up">
          <AppointmentForm />
        </div>
      </main>

      <footer className="pb-10 text-center text-xs text-gray-400">
        <p className="inline-flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          City Health Office &middot; Bacolod City
        </p>
      </footer>
    </div>
  )
}
