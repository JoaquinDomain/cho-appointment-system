'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Camera } from 'lucide-react'
import type { Html5Qrcode } from 'html5-qrcode'

interface QRScannerProps {
  onScan: (result: string) => void
  onClose: () => void
}

export default function QRScanner({ onScan, onClose }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const scannerRef = useRef<HTMLDivElement>(null)
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null)
  // keep callback steady so camera does not restart on each render
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    let mounted = true

    const stopScanner = async () => {
      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            await html5QrCodeRef.current.stop()
          }
          html5QrCodeRef.current.clear()
        } catch (err) {
          console.error('Error stopping scanner:', err)
        } finally {
          html5QrCodeRef.current = null
        }
      }
      if (mounted) setIsScanning(false)
    }

    const startScanner = async () => {
      try {
        // import here so it does not run on server
        const { Html5Qrcode } = await import('html5-qrcode')
        
        if (!mounted || !scannerRef.current) return

        const html5QrCode = new Html5Qrcode('qr-reader')
        html5QrCodeRef.current = html5QrCode

        const config = { fps: 10, qrbox: { width: 250, height: 250 } }
        
        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText: string) => {
            if (mounted) {
              const cb = onScanRef.current
              void stopScanner().finally(() => cb(decodedText))
            }
          },
          () => {
            // scan misses are normal, ignore
          }
        )
        
        setIsScanning(true)
        setError('')
      } catch (err) {
        console.error('Scanner error:', err)
        if (mounted) {
          setError('Failed to start camera. Please ensure camera permissions are granted.')
          setIsScanning(false)
        }
      }
    }

    startScanner()

    return () => {
      mounted = false
      const inst = html5QrCodeRef.current
      html5QrCodeRef.current = null
      if (inst) {
        inst.stop().catch(() => {})
        try {
          inst.clear()
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }, [retryKey])

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-line p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-navy">QR Code Scanner</h3>
        <button
          onClick={onClose}
          className="p-2 hover:bg-line/60 rounded-full transition-colors"
          aria-label="Close scanner"
        >
          <X className="w-5 h-5 text-muted" />
        </button>
      </div>

      <div className="relative">
        <div ref={scannerRef} id="qr-reader" className="w-full" />

        {!isScanning && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-page rounded-xl">
            <div className="text-center">
              <Camera className="w-12 h-12 text-faint mx-auto mb-2" />
              <p className="text-sm text-muted">Initializing camera…</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-danger-surface rounded-xl">
            <div className="text-center p-4">
              <p className="text-danger">{error}</p>
              <button
                onClick={() => { setError(''); setRetryKey(k => k + 1) }}
                className="mt-2 px-4 py-2 bg-danger text-white rounded-xl hover:bg-danger/90 transition-colors text-sm font-semibold"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 text-center text-sm text-muted">
        <p>Point the camera at a patient&apos;s QR code</p>
      </div>
    </div>
  )
}