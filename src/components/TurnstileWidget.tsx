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
          // Mobile networks often fail first load — back off and retry.
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
}: {
  onToken: (token: string) => void
  onExpire: () => void
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
  const mountRef = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const cbRef = useRef({ onToken, onExpire })
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    cbRef.current = { onToken, onExpire }
  }, [onToken, onExpire])

  const renderWidget = useCallback(() => {
    if (!mountRef.current || !window.turnstile || !siteKey) return false
    try {
      if (widgetId.current && window.turnstile.remove) {
        try {
          window.turnstile.remove(widgetId.current)
        } catch {
          // stale id — fall through and re-render
        }
        widgetId.current = null
      }
      widgetId.current = window.turnstile.render(mountRef.current, {
        sitekey: siteKey,
        theme: 'auto',
        // Flexible width collapses to narrow phone screens instead of
        // overflowing a fixed 300px frame (common mobile breakage).
        size: 'flexible',
        language: 'auto',
        // Let Cloudflare auto-retry the challenge handshake on flaky mobile data.
        retry: 'auto',
        'retry-interval': 2000,
        'refresh-expired': 'auto',
        callback: (t: string) => {
          setFailed(false)
          cbRef.current.onToken(t)
        },
        'expired-callback': () => {
          widgetId.current = null
          cbRef.current.onExpire()
        },
        'error-callback': () => {
          // Widget iframe loaded but couldn't reach Cloudflare
          // (offline blip, in-app browser, adblock/DNS filter).
          setFailed(true)
          cbRef.current.onExpire()
        },
        'timeout-callback': () => {
          setFailed(true)
          cbRef.current.onExpire()
        },
      })
      return true
    } catch {
      setFailed(true)
      return false
    }
  }, [siteKey])

  useEffect(() => {
    if (!siteKey) return
    let cancelled = false
    setFailed(false)
    loadScript(3)
      .then(() => {
        if (!cancelled) {
          // Small delay: on mobile WebViews the DOM/iframe isn't always
          // ready the instant api.js fires onload.
          setTimeout(() => {
            if (!cancelled && !renderWidget()) setFailed(true)
          }, 300)
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
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
  }, [siteKey, renderWidget])

  const retry = useCallback(() => {
    setFailed(false)
    cbRef.current.onExpire()
    if (window.turnstile) {
      if (!renderWidget()) {
        loadScript(3)
          .then(() => renderWidget())
          .catch(() => setFailed(true))
      }
    } else {
      loadScript(3)
        .then(() => renderWidget())
        .catch(() => setFailed(true))
    }
  }, [renderWidget])

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
