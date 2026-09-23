// Authenticated session E2E against the dev server.
// Creates a throwaway admin in D1, exercises login -> cookie -> admin routes
// -> logout, then ALWAYS deletes the admin and its sessions (finally block).
import { randomBytes, scryptSync, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const BASE = 'http://localhost:3000'
const XFF = '198.51.100.201'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).trim()]
    })
)
const D1_EP = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${env.CLOUDFLARE_D1_DATABASE_ID}/query`

async function d1(sql, params = []) {
  const r = await fetch(D1_EP, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_D1_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  })
  const j = await r.json()
  if (!r.ok || j.success === false) {
    throw new Error(`D1 error: ${JSON.stringify(j.errors || j).slice(0, 300)}`)
  }
  return j.result[0]
}

function hashPassword(pw) {
  const salt = randomBytes(16).toString('base64')
  const hash = scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')
  return `scrypt$v=1$n=16384$r=8$p=1$${salt}$${hash}`
}

const email = `e2e-tmp-${Date.now()}@example.com`
const password = randomBytes(16).toString('base64')
const results = []
function add(name, ok, notes = '') {
  results.push({ Test: name, Result: ok ? 'PASS' : 'FAIL', Notes: notes })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${notes ? '  (' + notes + ')' : ''}`)
}

function cookieOf(res) {
  const sc = res.headers.get('set-cookie') || ''
  const m = sc.match(/cho_admin_session=([0-9a-f]{64})/)
  return { sc, token: m ? m[1] : null }
}
const redact = (sc) => sc.replace(/cho_admin_session=[^;]*/, 'cho_admin_session=<redacted>')

let cleanupOk = false
try {
  await d1('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)', [
    email,
    hashPassword(password),
  ])
  console.log(`temp admin created: ${email}`)

  const login = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': XFF,
      'X-Forwarded-Proto': 'https',
    },
    body: JSON.stringify({ email, password }),
  })
  const loginJson = await login.json().catch(() => ({}))
  const { sc: loginSc, token } = cookieOf(login)
  add(
    'valid login -> 200 ok + session token',
    login.status === 200 && loginJson.ok === true && Boolean(token),
    `status=${login.status}`
  )
  add(
    'cookie is HttpOnly + Secure (x-forwarded-proto https) + SameSite=Lax',
    /HttpOnly/i.test(loginSc) && /Secure/i.test(loginSc) && /SameSite=Lax/i.test(loginSc),
    redact(loginSc)
  )
  const cookie = token ? `cho_admin_session=${token}` : ''

  const me = await fetch(`${BASE}/api/admin/me`, {
    headers: { Cookie: cookie, 'X-Forwarded-For': XFF },
  })
  const meJson = await me.json().catch(() => ({}))
  add(
    'admin/me with session -> 200 + own email',
    me.status === 200 && meJson.email === email,
    `status=${me.status}`
  )

  const list = await fetch(`${BASE}/api/appointments`, {
    headers: { Cookie: cookie, 'X-Forwarded-For': XFF },
  })
  add('GET /api/appointments with session -> 200', list.status === 200, `status=${list.status}`)

  const ciBad = await fetch(`${BASE}/api/appointments/not-a-uuid/check-in`, {
    method: 'POST',
    headers: { Cookie: cookie, 'X-Forwarded-For': XFF },
  })
  add('check-in invalid id with session -> 400', ciBad.status === 400, `status=${ciBad.status}`)

  const fakeId = randomUUID()
  const ci404 = await fetch(`${BASE}/api/appointments/${fakeId}/check-in`, {
    method: 'POST',
    headers: { Cookie: cookie, 'X-Forwarded-For': XFF },
  })
  add('check-in unknown id with session -> 404', ci404.status === 404, `status=${ci404.status}`)

  const ci401 = await fetch(`${BASE}/api/appointments/${fakeId}/check-in`, {
    method: 'POST',
    headers: { 'X-Forwarded-For': '203.0.113.250' },
  })
  add('check-in no session -> 401', ci401.status === 401, `status=${ci401.status}`)

  const wrong = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': XFF },
    body: JSON.stringify({ email, password: password + '-wrong' }),
  })
  add('wrong password for real admin -> 401', wrong.status === 401, `status=${wrong.status}`)

  const noProto = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.251' },
    body: JSON.stringify({ email, password }),
  })
  const noProtoSc = cookieOf(noProto).sc
  add(
    'cookie NOT Secure when x-forwarded-proto absent (dev)',
    noProto.status === 200 && !/; ?Secure/i.test(noProtoSc),
    `status=${noProto.status}`
  )

  const logout = await fetch(`${BASE}/api/admin/logout`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'X-Forwarded-For': XFF,
      'X-Forwarded-Proto': 'https',
    },
  })
  const loSc = logout.headers.get('set-cookie') || ''
  add(
    'logout -> 200 + cookie cleared (Max-Age=0)',
    logout.status === 200 && /Max-Age=0/i.test(loSc),
    `status=${logout.status}`
  )

  const meAfter = await fetch(`${BASE}/api/admin/me`, {
    headers: { Cookie: cookie, 'X-Forwarded-For': XFF },
  })
  add(
    'admin/me after logout -> 401 (session destroyed)',
    meAfter.status === 401,
    `status=${meAfter.status}`
  )
} catch (e) {
  add('e2e script ran to completion', false, String(e).slice(0, 200))
} finally {
  try {
    await d1('DELETE FROM admin_sessions WHERE email = ?', [email])
    await d1('DELETE FROM admin_users WHERE email = ?', [email])
    const admins = await d1('SELECT email FROM admin_users WHERE email = ?', [email])
    const sess = await d1('SELECT 1 AS x FROM admin_sessions WHERE email = ?', [email])
    cleanupOk = admins.results.length === 0 && sess.results.length === 0
    add('cleanup: temp admin + sessions deleted', cleanupOk)
  } catch (e) {
    add('cleanup: temp admin + sessions deleted', false, String(e).slice(0, 200))
  }
}

console.log('')
for (const r of results) console.log(`${r.Result}  ${r.Test}${r.Notes ? '  | ' + r.Notes : ''}`)
const pass = results.filter((r) => r.Result === 'PASS').length
const fail = results.filter((r) => r.Result === 'FAIL').length
console.log(`\nPASS: ${pass}  FAIL: ${fail}`)
process.exitCode = fail > 0 || !cleanupOk ? 1 : 0
