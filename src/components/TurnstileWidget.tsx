'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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

function loadScript(retries = 3): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve()
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`)
    if (existing) {
      let waited = 0
      const t = setInterval(() => {
        if (window.turnstile) {
          clearInterval(t)
          resolve()
        } else if ((waited += 200) > 15000) {
          clearInterval(t)
          reject(new Error('load-timeout'))
        }
      }, 200)
      return
    }
    let attempt = 0
    const tryInsert = () => {
      attempt++
      const s = document.createElement('script')
      s.src = SRC
      s.async = true
      s.defer = true
      s.onload = () => {
        window.__turnstileLoaded = true
        resolve()
      }
      s.onerror = () => {
        s.remove()
        if (attempt < retries) {
          // first load often fails on mobile data, wait then try again
          setTimeout(tryInsert, attempt * 1500)
        } else {
          reject(new Error('script-error'))
        }
      }
      document.head.appendChild(s)
    }
    tryInsert()
  })
}

export default function TurnstileWidget({
  onToken,
  onExpire,
  onUnavailable,
}: {
  onToken: (token: string) => void
  onExpire: () => void
  /** Called when cloudflare cannot be reached, form can use fallback. */
  onUnavailable: () => void
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
  const mountRef = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const failures = useRef(0)
  const cbRef = useRef({ onToken, onExpire, onUnavailable })
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    cbRef.current = { onToken, onExpire, onUnavailable }
  }, [onToken, onExpire, onUnavailable])

  const noteFailure = useCallback(() => {
    failures.current += 1
    setFailed(true)
    cbRef.current.onExpire()
    // 2 fails means phone/net cannot reach cloudflare, use fallback
    if (failures.current >= 2) cbRef.current.onUnavailable()
  }, [])

  const renderWidget = useCallback(() => {
    if (!mountRef.current || !window.turnstile || !siteKey) return false
    try {
      if (widgetId.current && window.turnstile.remove) {
        try {
          window.turnstile.remove(widgetId.current)
        } catch {
          // old id, just render again
        }
        widgetId.current = null
      }
      widgetId.current = window.turnstile.render(mountRef.current, {
        sitekey: siteKey,
        theme: 'auto',
        // flexible so it fits small phone screens
        size: 'flexible',
        language: 'auto',
        // auto retry for unstable mobile data
        retry: 'auto',
        'retry-interval': 2000,
        'refresh-expired': 'auto',
        callback: (t: string) => {
          failures.current = 0
          setFailed(false)
          cbRef.current.onToken(t)
        },
        'expired-callback': () => {
          widgetId.current = null
          cbRef.current.onExpire()
        },
        'error-callback': () => {
          // widget loaded but no connection to cloudflare. not just expired.
          noteFailure()
        },
        'timeout-callback': () => {
          noteFailure()
        },
      })
      return true
    } catch {
      noteFailure()
      return false
    }
  }, [siteKey, noteFailure])

  useEffect(() => {
    if (!siteKey) return
    let cancelled = false
    failures.current = 0
    queueMicrotask(() => {
      if (!cancelled) setFailed(false)
    })
    loadScript(3)
      .then(() => {
        if (!cancelled) {
          // small wait, api.js onload fires early on some webviews
          setTimeout(() => {
            if (!cancelled && !renderWidget()) noteFailure()
          }, 300)
        }
      })
      .catch(() => {
        if (!cancelled) noteFailure()
      })
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
  }, [siteKey, renderWidget, noteFailure])

  const retry = useCallback(() => {
    setFailed(false)
    cbRef.current.onExpire()
    if (window.turnstile) {
      if (!renderWidget()) {
        loadScript(3)
          .then(() => renderWidget())
          .catch(() => noteFailure())
      }
    } else {
      loadScript(3)
        .then(() => {
          if (!renderWidget()) noteFailure()
        })
        .catch(() => noteFailure())
    }
  }, [renderWidget, noteFailure])

  if (!siteKey) return null
  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={mountRef} className="flex justify-center w-full min-h-[65px]" />
      {failed && (
        <div className="text-center">
          <p className="text-xs text-slate-500">
            Verification didn&apos;t load. Check your connection, or open this page in
            Chrome/Safari instead of an in-app browser.
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-1.5 px-4 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 text-sm font-semibold hover:bg-sky-100 transition-colors"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
