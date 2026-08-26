import { redirect } from 'next/navigation'
import { HeartPulse, FlaskConical, Clock } from 'lucide-react'
import AppointmentForm from '@/components/AppointmentForm'
import { isAdminSite } from '@/lib/appMode'

export default function Home() {
  if (isAdminSite) {
    redirect('/admin')
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-100 via-blue-50 to-white">
      <header className="bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mb-4 shadow-lg">
            <HeartPulse className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-2">
            CHO Laboratory Appointment System
          </h1>
          <p className="text-blue-100 text-sm sm:text-base">
            City Health Office &middot; Bacolod City
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs sm:text-sm">
            <span className="inline-flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1.5">
              <FlaskConical className="w-4 h-4" /> Book lab tests online
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1.5">
              <Clock className="w-4 h-4" /> Lab opens 8:00 AM
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 -mt-6 pb-12">
        <AppointmentForm />
      </main>

      <footer className="pb-8 text-center text-xs text-gray-400">
        City Health Office &middot; Bacolod City
      </footer>
    </div>
  )
}
