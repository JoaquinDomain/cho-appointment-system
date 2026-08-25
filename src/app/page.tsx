import AppointmentForm from '@/components/AppointmentForm'
import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">CHO Laboratory Appointment System</h1>
          <p className="text-gray-600">City Health Office - Bacolod City</p>
          <Link 
            href="/admin" 
            className="inline-block mt-4 text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Admin Access
          </Link>
        </header>
        <AppointmentForm />
      </div>
    </div>
  )
}