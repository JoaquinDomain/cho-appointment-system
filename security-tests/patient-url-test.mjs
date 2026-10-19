// Unit tests for src/lib/patient-site-url.ts — run with: node security-tests/patient-url-test.mjs
// Node >= 22.18 imports TypeScript directly (type stripping), so the real
// production resolver is tested, not a copy.
import { resolvePatientSiteUrl } from '../src/lib/patient-site-url.ts'

let pass = 0
let fail = 0

function check(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    pass++
    console.log(`  ok   ${name}`)
  } else {
    fail++
    console.log(`  FAIL ${name}\n       expected ${e}\n       actual   ${a}`)
  }
}

const PROD = 'https://cho-laboratory-services-appointment.bacolodcity.gov.ph/'
const OLD_VERCEL = 'https://cho-appointment-system.vercel.app/'

// 1. valid production env URL wins
check(
  'prod + valid env URL -> env',
  resolvePatientSiteUrl({ envUrl: PROD, isAdminSite: false, origin: 'http://localhost:3000', isDev: false }),
  { ok: true, url: PROD, source: 'env' }
)

// 2. prod rejects vercel.app host (even as env)
{
  const r = resolvePatientSiteUrl({ envUrl: OLD_VERCEL, isAdminSite: false, origin: null, isDev: false })
  check('prod + vercel.app env URL -> rejected', r.ok, false)
}

// 3. prod rejects http (non-https)
{
  const r = resolvePatientSiteUrl({ envUrl: 'http://example.com/', isAdminSite: false, origin: null, isDev: false })
  check('prod + http env URL -> rejected', r.ok, false)
}

// 4. prod rejects malformed env URL
{
  const r = resolvePatientSiteUrl({ envUrl: 'not a url', isAdminSite: false, origin: null, isDev: false })
  check('prod + malformed env URL -> rejected', r.ok, false)
}

// 5. dev allows vercel.app (local .env.local untouched) and http
check(
  'dev + vercel.app env URL -> env (local workflows untouched)',
  resolvePatientSiteUrl({ envUrl: OLD_VERCEL, isAdminSite: true, origin: 'http://localhost:3000', isDev: true }),
  { ok: true, url: OLD_VERCEL, source: 'env' }
)

// 6. no env, patient-mode prod: origin is the site (after hydration)
check(
  'prod patient-mode, no env, origin known -> origin',
  resolvePatientSiteUrl({ envUrl: undefined, isAdminSite: false, origin: PROD, isDev: false }),
  { ok: true, url: PROD, source: 'origin' }
)

// 7. no env, patient-mode, pre-hydration: explicit wait, not a guess
check(
  'patient-mode pre-hydration -> wait reason',
  resolvePatientSiteUrl({ envUrl: '', isAdminSite: false, origin: null, isDev: false }),
  { ok: false, reason: 'Waiting for the page origin…' }
)

// 8. no env, admin-mode, prod: rejected (guard makes this unreachable anyway)
{
  const r = resolvePatientSiteUrl({ envUrl: undefined, isAdminSite: true, origin: null, isDev: false })
  check('prod admin-mode without env -> rejected', r.ok, false)
}

// 9. no env, admin-mode, dev, origin known -> dev origin fallback
check(
  'dev admin-mode without env -> dev-origin',
  resolvePatientSiteUrl({ envUrl: undefined, isAdminSite: true, origin: 'http://localhost:3000', isDev: true }),
  { ok: true, url: 'http://localhost:3000', source: 'dev-origin' }
)

// 10. no env, admin-mode, dev, pre-hydration -> wait
check(
  'dev admin-mode pre-hydration -> wait',
  resolvePatientSiteUrl({ envUrl: undefined, isAdminSite: true, origin: null, isDev: true }).ok,
  false
)

// 11. whitespace-only env falls through to no-env behavior
check(
  'whitespace env + patient-mode prod + origin -> origin',
  resolvePatientSiteUrl({ envUrl: '   ', isAdminSite: false, origin: PROD, isDev: false }),
  { ok: true, url: PROD, source: 'origin' }
)

// 12. subdomain vercel host also refused in prod
{
  const r = resolvePatientSiteUrl({ envUrl: 'https://my-app.vercel.app/', isAdminSite: false, origin: null, isDev: false })
  check('prod + *.vercel.app subdomain -> rejected', r.ok, false)
}

// 13. URL normalization: bare origin gains trailing slash (stable QR value)
check(
  'env without trailing path normalizes',
  resolvePatientSiteUrl({ envUrl: 'https://example.gov.ph', isAdminSite: false, origin: null, isDev: false }),
  { ok: true, url: 'https://example.gov.ph/', source: 'env' }
)

console.log(`\npatient-url: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
