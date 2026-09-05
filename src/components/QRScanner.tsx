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
  // Stabilize callback so the camera isn't re-initialized on every parent render.
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
        // Dynamically import html5-qrcode to avoid SSR issues
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
            // Ignore scan errors, they're normal during scanning
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
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">QR Code Scanner</h3>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="relative">
        <div ref={scannerRef} id="qr-reader" className="w-full" />
        
        {!isScanning && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
            <div className="text-center">
              <Camera className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">Initializing camera...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-50 rounded-lg">
            <div className="text-center p-4">
              <p className="text-red-800">{error}</p>
              <button
                onClick={() => { setError(''); setRetryKey(k => k + 1) }}
                className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 text-center text-sm text-gray-600">
        <p>Point the camera at a patient&apos;s QR code</p>
      </div>
    </div>
  )
}