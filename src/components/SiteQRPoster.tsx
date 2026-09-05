'use client'

import { useEffect, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Download, Printer } from 'lucide-react'

export default function SiteQRPoster() {
  const [originUrl, setOriginUrl] = useState('')
  const qrWrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOriginUrl(window.location.origin)
  }, [])
  // On the admin site the poster must point patients to the public booking site
  const siteUrl = process.env.NEXT_PUBLIC_PATIENT_SITE_URL || originUrl

  const handleDownload = () => {
    const canvas = qrWrapRef.current?.querySelector('canvas') as HTMLCanvasElement | undefined
    if (canvas) {
      const link = document.createElement('a')
      link.download = 'cho-appointment-qr-poster.png'
      link.href = canvas.toDataURL()
      link.click()
    }
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="bg-white p-4 sm:p-8 rounded-2xl shadow-lg max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Site Access QR Code</h2>
        <p className="text-gray-600">Display this poster at health stations for easy patient access</p>
      </div>

      <div className="border-4 border-blue-600 rounded-xl p-4 sm:p-8 bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center mb-6">
          <h3 className="text-3xl font-bold text-blue-900 mb-2">CHO Laboratory</h3>
          <h4 className="text-xl font-semibold text-blue-800">Appointment Booking System</h4>
          <p className="text-gray-700 mt-2">City Health Office - Bacolod City</p>
        </div>

        <div className="flex justify-center mb-6">
          <div ref={qrWrapRef} className="bg-white p-4 rounded-lg shadow-md border-2 border-blue-600">
            {siteUrl && <QRCodeCanvas value={siteUrl} size={256} level="H" />}
          </div>
        </div>

        <div className="text-center space-y-2">
          <p className="text-lg font-semibold text-gray-800">Scan to Book Your Appointment</p>
          <p className="text-sm text-gray-600 break-all">Visit: {siteUrl}</p>
          <div className="mt-4 p-3 bg-yellow-100 border border-yellow-300 rounded-lg">
            <p className="text-sm text-yellow-800 font-medium">
              Available 24/7 • No Registration Required
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 mt-6">
        <button
          onClick={handleDownload}
          className="flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
        >
          <Download className="w-5 h-5 mr-2" />
          Download Poster
        </button>
        <button
          onClick={handlePrint}
          className="flex items-center justify-center px-6 py-3 bg-gray-600 text-white rounded-xl hover:bg-gray-700 transition-colors font-medium"
        >
          <Printer className="w-5 h-5 mr-2" />
          Print Poster
        </button>
      </div>
    </div>
  )
}