// Best-effort in-memory sliding-window rate limiter for a single instance.
// For multi-instance / production-grade limiting, replace with Upstash Redis.
// Keyed by IP (+ route). Expired buckets are pruned on each hit.

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

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now()
  prune(now, windowMs)
  const bucket = buckets.get(key) ?? { hits: [] }
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs)
  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0]
    const retryAfterSec = Math.ceil((oldest + windowMs - now) / 1000)
    return { allowed: false, retryAfterSec: Math.max(retryAfterSec, 1) }
  }
  bucket.hits.push(now)
  buckets.set(key, bucket)
  return { allowed: true, retryAfterSec: 0 }
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}
