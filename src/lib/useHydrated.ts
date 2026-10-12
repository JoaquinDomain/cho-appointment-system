import { useEffect, useState } from 'react'

// True once the component tree has hydrated in the browser.
// The SSR HTML ships onClick-driven controls disabled so a slow or failed
// hydration shows inert controls instead of buttons that ignore clicks.
// The flag flips in a microtask queued from an effect: the first client render
// must match the server (false), and this repo's lint rules forbid calling
// setState synchronously inside an effect body.
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return hydrated
}
