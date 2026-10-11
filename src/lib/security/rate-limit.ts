// Simple in-memory rate limit per server instance.
// Old entries are cleared on each check.
// NOTE: state is per-instance — on serverless each instance has its own
// buckets and cold starts reset them. A shared store (Redis/Upstash)
// is the upgrade path if global limits are required.

interface Bucket {
  hits: number[]
}

const buckets = new Map<string, Bucket>()

function prune(now: number, windowMs: number) {
  for (const [key, b] of buckets) {
    b.hits = b.hits.filter((t) => now - t < windowMs)
    if (b.hits.length === 0) buckets.delete(key)
  }
}

/**
 * Read a rate-limit setting from the environment with a safe fallback.
 * Looks up `<PREFIX>_LIMIT` (max requests) and `<PREFIX>_WINDOW_MS` (window
 * length in milliseconds). Missing or invalid values fall back to the
 * defaults, so a typo can never disable a limit.
 *
 * Configurable endpoints (see .env.example):
 *   RL_LOGIN_IP_*             admin login attempts per IP        (10 / 10 min)
 *   RL_LOGIN_FAIL_*           failed logins per account email    (5 / 15 min)
 *   RL_BOOK_IP_*              public bookings per IP             (10 / 10 min)
 *   RL_BOOK_UNVERIFIED_IP_*   bookings without Turnstile per IP  (3 / 60 min)
 */
export function limitFromEnv(
  prefix: string,
  fallbackLimit: number,
  fallbackWindowMs: number
): { limit: number; windowMs: number } {
  const readInt = (name: string, fallback: number, min: number, max: number): number => {
    const raw = process.env[name]
    if (raw === undefined || raw === '') return fallback
    const value = Number(raw)
    if (!Number.isInteger(value) || value < min || value > max) {
      console.warn(`Ignoring invalid ${name}; using default ${fallback}.`)
      return fallback
    }
    return value
  }
  return {
    limit: readInt(`${prefix}_LIMIT`, fallbackLimit, 1, 100000),
    windowMs: readInt(`${prefix}_WINDOW_MS`, fallbackWindowMs, 1000, 24 * 60 * 60 * 1000),
  }
}

/** Check the limit WITHOUT recording a hit (for fail-only counters). */
export function peekRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now()
  prune(now, windowMs)
  const hits = (buckets.get(key)?.hits ?? []).filter((t) => now - t < windowMs)
  if (hits.length >= limit) {
    const oldest = hits[0]
    const retryAfterSec = Math.ceil((oldest + windowMs - now) / 1000)
    return { allowed: false, retryAfterSec: Math.max(retryAfterSec, 1) }
  }
  return { allowed: true, retryAfterSec: 0 }
}

/** Record one hit against the key. */
export function recordRateLimit(key: string, windowMs: number): void {
  const now = Date.now()
  prune(now, windowMs)
  const bucket = buckets.get(key) ?? { hits: [] }
  bucket.hits.push(now)
  buckets.set(key, bucket)
}

/** Check the limit and record a hit when allowed. */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSec: number } {
  const result = peekRateLimit(key, limit, windowMs)
  if (result.allowed) recordRateLimit(key, windowMs)
  return result
}

export function getClientIp(req: Request): string {
  // Trust only the RIGHTMOST x-forwarded-for entry: it is appended by the
  // nearest trusted proxy (Nginx on MITCS). Entries to the left are
  // client-supplied and must never be used as a rate-limit key (spoofable).
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) {
    const parts = fwd
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
  }
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}
