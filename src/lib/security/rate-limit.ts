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
  // nearest trusted proxy (Vercel). Entries to the left are client-supplied
  // and must never be used as a rate-limit key (they are spoofable).
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
