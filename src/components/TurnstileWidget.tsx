'use client'

import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (id?: string) => void
      remove?: (id?: string) => void
    }
    __turnstileLoaded?: boolean
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export default function TurnstileWidget({
  onToken,
  onExpire,
}: {
  onToken: (token: string) => void
  onExpire: () => void
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
  const mountRef = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const cbRef = useRef({ onToken, onExpire })
  useEffect(() => {
    cbRef.current = { onToken, onExpire }
  }, [onToken, onExpire])

  useEffect(() => {
    if (!siteKey) return
    let cancelled = false

    function render() {
      if (cancelled || !mountRef.current || !window.turnstile || widgetId.current) return
      widgetId.current = window.turnstile.render(mountRef.current, {
        sitekey: siteKey,
        callback: (t: string) => cbRef.current.onToken(t),
        'expired-callback': () => {
          widgetId.current = null
          cbRef.current.onExpire()
        },
        'error-callback': () => cbRef.current.onExpire(),
      })
    }

    if (window.turnstile) {
      render()
      return () => {
        cancelled = true
      }
    }
    if (!document.querySelector(`script[src="${SRC}"]`)) {
      const s = document.createElement('script')
      s.src = SRC
      s.async = true
      s.defer = true
      s.onload = () => {
        window.__turnstileLoaded = true
        render()
      }
      document.head.appendChild(s)
    } else {
      const t = setInterval(() => {
        if (window.turnstile) {
          clearInterval(t)
          render()
        }
      }, 200)
      setTimeout(() => clearInterval(t), 10000)
    }
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetId.current)
        } catch {
          // ignore cleanup errors
        }
        widgetId.current = null
      }
    }
  }, [siteKey])

  if (!siteKey) return null
  return <div ref={mountRef} className="flex justify-center" />
}
