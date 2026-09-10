// Server-only Cloudflare Turnstile verification for public booking.
// Never import from a 'use client' component.
interface VerifyResponse {
  success: boolean
  'error-codes'?: string[]
  hostname?: string
}

export function turnstileConfigured(): boolean {
  return Boolean(
    process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  )
}

export async function verifyTurnstile(
  token: string,
  remoteIp?: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return { ok: true } // not configured (local dev) — fail open
  if (!token || token.length < 10 || token.length > 4096) {
    return { ok: false, reason: 'missing-token' }
  }
  try {
    const body = new URLSearchParams({ secret, response: token })
    if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp)
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => null)) as VerifyResponse | null
    if (json?.success) return { ok: true }
    return { ok: false, reason: (json?.['error-codes'] ?? ['verify-failed']).slice(0, 2).join(',') }
  } catch (e) {
    console.error('Turnstile verify failed:', e)
    return { ok: false, reason: 'verify-error' }
  }
}
