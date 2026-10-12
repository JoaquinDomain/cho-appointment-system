'use client'

import { useRef } from 'react'
import { Download } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'

export default function ConfirmationQRCode({ qrCodeId }: { qrCodeId: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const handleDownload = () => {
    const canvas = wrapRef.current?.querySelector('canvas') as HTMLCanvasElement | undefined
    if (canvas) {
      const link = document.createElement('a')
      link.download = `appointment-qr-${qrCodeId}.png`
      link.href = canvas.toDataURL()
      link.click()
    }
  }

  return (
    <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="p-1.5 rounded-2xl bg-gradient-to-br from-sky-800 to-cyan-600 shadow-lg shadow-sky-500/25">
        <div ref={wrapRef} className="bg-white p-4 rounded-xl">
          <QRCodeCanvas value={qrCodeId} size={200} level="H" />
        </div>
      </div>
      <p className="text-[13px] text-slate-600 mt-3 font-medium">Show this QR code at the laboratory</p>
      <button
        onClick={handleDownload}
        className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-sky-800 hover:border-sky-400 hover:bg-sky-50 text-sm font-semibold transition-colors"
      >
        <Download className="w-4 h-4" />
        Download QR Code
      </button>
    </div>
  )
}
