'use client'

import { useEffect } from 'react'

declare global {
  interface Window {
    __choReady?: boolean
    __choClearWatchdog?: () => void
  }
}

// Mounted in the root layout on every page. When React hydrates, this effect
// runs and tells the inline load watchdog (see layout.tsx) that the page is
// interactive, so its fallback notice never appears on a healthy load.
export default function HydrationPing() {
  useEffect(() => {
    window.__choReady = true
    if (typeof window.__choClearWatchdog === 'function') window.__choClearWatchdog()
  }, [])
  return null
}
