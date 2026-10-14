'use client'

import { useEffect, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { AlertTriangle, Download, Printer } from 'lucide-react'
import { isAdminSite } from '@/lib/appMode'
import { resolvePatientSiteUrl } from '@/lib/patient-site-url'

export default function SiteQRPoster() {
  const [originUrl, setOriginUrl] = useState<string | null>(null)
  const qrWrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOriginUrl(window.location.origin)
  }, [])

  // Resolution rules live in src/lib/patient-site-url.ts (unit-tested).
  // Never guess a public URL: a missing or invalid configuration renders an
  // explicit error box instead of a QR code pointing at the wrong site.
  const resolved = resolvePatientSiteUrl({
    envUrl: process.env.NEXT_PUBLIC_PATIENT_SITE_URL,
    isAdminSite,
    origin: originUrl,
    isDev: process.env.NODE_ENV !== 'production',
  })

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
    <div className="bg-white p-4 sm:p-8 rounded-2xl shadow-sm border border-line max-w-2xl mx-auto my-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-navy mb-2">Site Access QR Code</h2>
        <p className="text-muted">Display this poster at health stations for easy patient access</p>
      </div>

      <div className="border-4 border-brand rounded-xl p-4 sm:p-8 bg-soft/50">
        <div className="text-center mb-6">
          <h3 className="text-3xl font-bold text-navy mb-2">CHO Laboratory</h3>
          <h4 className="text-xl font-semibold text-brand">Appointment Booking System</h4>
          <p className="text-ink mt-2">City Health Office - Bacolod City</p>
        </div>

        {resolved.ok ? (
          <>
            <div className="flex justify-center mb-6">
              <div ref={qrWrapRef} className="bg-white p-4 rounded-lg shadow-md border-2 border-brand">
                <QRCodeCanvas value={resolved.url} size={256} level="H" />
              </div>
            </div>

            <div className="text-center space-y-2">
              <p className="text-lg font-semibold text-ink">Scan to Book Your Appointment</p>
              <p className="text-sm text-muted break-all">Visit: {resolved.url}</p>
              <div className="mt-4 p-3 bg-warn-surface border border-warn/30 rounded-lg">
                <p className="text-sm text-warn font-medium">
                  Available 24/7 • No Registration Required
                </p>
              </div>
            </div>
          </>
        ) : (
          <div
            className="flex flex-col items-center gap-3 p-6 bg-danger-surface border-2 border-danger/30 rounded-xl text-center"
            role="alert"
          >
            <AlertTriangle className="w-8 h-8 text-danger" />
            <p className="font-bold text-danger">Patient site URL is not configured</p>
            <p className="text-sm text-danger max-w-md break-words">{resolved.reason}</p>
          </div>
        )}
      </div>

      {resolved.ok && (
        <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 mt-6">
          <button
            onClick={handleDownload}
            className="flex items-center justify-center px-6 py-3 bg-brand text-white rounded-xl hover:bg-brand-dark transition-colors font-medium"
          >
            <Download className="w-5 h-5 mr-2" />
            Download Poster
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center justify-center px-6 py-3 bg-navy text-white rounded-xl hover:bg-navy/90 transition-colors font-medium"
          >
            <Printer className="w-5 h-5 mr-2" />
            Print Poster
          </button>
        </div>
      )}
    </div>
  )
}
