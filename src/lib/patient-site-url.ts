// Resolution rules for the patient booking URL shown in the admin QR poster.
// Pure module: no React, no browser APIs — importable by Node tests directly.
//
// Rules (in order):
//   1. NEXT_PUBLIC_PATIENT_SITE_URL (inlined at build time) wins when it is a
//      valid http(s) URL. In production it must be https and must NOT be a
//      vercel.app domain (the old hosting); a wrong URL fails loudly instead
//      of silently printing QR posters for the wrong site.
//   2. No env URL + patient-mode build: the current origin IS the patient
//      site (single-site production), used once the page has hydrated.
//   3. No env URL + admin-mode build: allowed only in development, falling
//      back to the current origin (localhost). Production admin builds are
//      already refused by the next.config.ts guard, so this path cannot
//      reach production.

export interface PatientSiteUrlInput {
  /** NEXT_PUBLIC_PATIENT_SITE_URL as inlined at build time (may be empty). */
  envUrl: string | undefined
  /** True when NEXT_PUBLIC_APP_MODE === 'admin' (dev convenience only). */
  isAdminSite: boolean
  /** window.location.origin once known; null before hydration / server. */
  origin: string | null
  /** NODE_ENV !== 'production'. */
  isDev: boolean
}

export type PatientSiteUrlResult =
  | { ok: true; url: string; source: 'env' | 'origin' | 'dev-origin' }
  | { ok: false; reason: string }

function parseHttpUrl(value: string): URL | null {
  try {
    const u = new URL(value)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u
  } catch {
    return null
  }
}

function isVercelHost(url: URL): boolean {
  return url.hostname === 'vercel.app' || url.hostname.endsWith('.vercel.app')
}

export function resolvePatientSiteUrl(input: PatientSiteUrlInput): PatientSiteUrlResult {
  const env = (input.envUrl ?? '').trim()

  if (env) {
    const parsed = parseHttpUrl(env)
    if (!parsed) {
      return {
        ok: false,
        reason:
          'NEXT_PUBLIC_PATIENT_SITE_URL is not a valid http(s) URL. Fix the build environment and rebuild.',
      }
    }
    if (!input.isDev && parsed.protocol !== 'https:') {
      return {
        ok: false,
        reason: 'The production patient site URL must use https. Refusing to generate the QR poster.',
      }
    }
    if (!input.isDev && isVercelHost(parsed)) {
      return {
        ok: false,
        reason:
          'NEXT_PUBLIC_PATIENT_SITE_URL points to a vercel.app domain. ' +
          'Production must use the official City Health Office URL. Refusing to generate the QR poster.',
      }
    }
    return { ok: true, url: parsed.toString(), source: 'env' }
  }

  if (input.isAdminSite) {
    // Admin-mode builds have no origin of their own to advertise.
    if (input.isDev && input.origin) {
      return { ok: true, url: input.origin, source: 'dev-origin' }
    }
    return {
      ok: false,
      reason:
        'NEXT_PUBLIC_PATIENT_SITE_URL is not set. Set it (at build time) to the patient booking URL so the QR poster points at the right site.',
    }
  }

  // Patient-mode build: the page origin is the booking site itself.
  if (input.origin) {
    return { ok: true, url: input.origin, source: 'origin' }
  }
  return { ok: false, reason: 'Waiting for the page origin…' }
}
