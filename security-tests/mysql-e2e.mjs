// MySQL migration E2E test.
//
// 1. boots a throwaway MySQL 8.0 server (mysql-memory-server, downloads the
//    official binaries on first run)
// 2. applies ./mysql/schema.sql
// 3. runs database-level assertions (types, CHECK constraints, FK cascade,
//    FOUND_ROWS update semantics)
// 4. starts the production Next.js server against that database
// 5. exercises patient + admin flows over HTTP (booking, search, status,
//    walk-in, QR check-in, session expiry, logout, authorization)
//
// Credentials only ever come from the environment. Run with:
//   node security-tests/mysql-e2e.mjs
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash, randomBytes, scryptSync } from 'node:crypto'
import { resolve } from 'node:path'
import { createDB } from 'mysql-memory-server'
import mysql from 'mysql2/promise'

const PORT = Number(process.env.E2E_PORT || 3100)
const BASE = `http://127.0.0.1:${PORT}`
const pad = (n) => String(n).padStart(2, '0')
// Server-local date: what the app's booking validation uses.
const LOCAL_TODAY = `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())}`
// Manila date: what the QR check-in window uses (UTC+8).
const MANILA_TODAY = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
const hashToken = (t) => createHash('sha256').update(t, 'utf8').digest('hex')

const results = []
function add(name, ok, notes = '') {
  results.push({ Test: name, Result: ok ? 'PASS' : 'FAIL', Notes: notes })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${notes ? '  (' + notes + ')' : ''}`)
}
const note = (e) => String(e && e.message ? e.message : e).slice(0, 200)

function hashPassword(pw) {
  const salt = randomBytes(16).toString('base64')
  const hash = scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')
  return `scrypt$v=1$n=16384$r=8$p=1$${salt}$${hash}`
}

const FACILITY = 'CHO Main / Bacolod City Health Office'
function booking(overrides = {}) {
  return {
    last_name: 'Dela Cruz',
    first_name: 'Juan',
    middle_name: 'S',
    birthdate: '1990-05-12',
    contact_number: '09171234567',
    consultation_facility: FACILITY,
    yakap_registered: false,
    yakap_facility: null,
    selected_tests: ['CBC'],
    appointment_date: LOCAL_TODAY,
    // Turnstile fallback path (phones that cannot reach Cloudflare):
    // honeypot empty + form open >= 4s + strict per-IP limit.
    turnstileUnavailable: true,
    website: '',
    formStartedAt: Date.now() - 5000,
    ...overrides,
  }
}

function cookieOf(res) {
  const sc = res.headers.get('set-cookie') || ''
  const m = sc.match(/cho_admin_session=([0-9a-f]{64})/)
  return { sc, token: m ? m[1] : null }
}

let server = null
let db = null
let conn = null

async function main() {
  try {
  // ---------- 1. database ----------
  console.log('Starting MySQL 8.0 (downloads binaries on first run)...')
  db = await createDB({
    version: '8.0.x',
    dbName: 'bcho_lab_appointment',
    xEnabled: 'OFF',
    logLevel: 'ERROR',
  })
  console.log(`MySQL up on port ${db.port} (user ${db.username}, db ${db.dbName})`)

  conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: db.port,
    user: db.username,
    password: '',
    database: db.dbName,
    dateStrings: true,
    multipleStatements: true,
  })
  await conn.query(readFileSync(resolve(process.cwd(), 'mysql/schema.sql'), 'utf8'))

  // shared by the server spawn and the script steps below
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    MYSQL_HOST: '127.0.0.1',
    MYSQL_PORT: String(db.port),
    MYSQL_DATABASE: db.dbName,
    MYSQL_USER: db.username,
    MYSQL_PASSWORD: '',
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY || 'test-secret',
  }

  // ---------- 2. database-level assertions ----------
  const [tables] = await conn.query(
    "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('appointments','admin_users','admin_sessions')"
  )
  add('schema creates appointments + admin_users + admin_sessions', tables.length === 3, `found=${tables.length}`)

  const adminEmail = 'e2e-admin@example.com'
  const adminPassword = randomBytes(16).toString('base64')
  await conn.execute('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)', [
    adminEmail,
    hashPassword(adminPassword),
  ])

  const uuid = '11111111-2222-4333-8444-555555555555'
  const createdAt = new Date().toISOString()
  await conn.execute(
    `INSERT INTO appointments
      (id, patient_name, last_name, first_name, middle_name, birthdate, age, contact_number,
       consultation_facility, yakap_registered, yakap_facility, selected_tests, appointment_date,
       status, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'online', ?)`,
    [uuid, 'Dela Cruz, Juan S', 'Dela Cruz', 'Juan', 'S', '1990-05-12', 36, '09171234567',
      FACILITY, 0, null, JSON.stringify(['CBC']), LOCAL_TODAY, createdAt]
  )
  const [roundtrip] = await conn.execute('SELECT * FROM appointments WHERE id = ?', [uuid])
  const row = roundtrip[0]
  add(
    'INSERT/SELECT roundtrip keeps expected column types',
    typeof row.id === 'string' &&
      typeof row.age === 'number' &&
      typeof row.yakap_registered === 'number' &&
      typeof row.selected_tests === 'string' &&
      Array.isArray(JSON.parse(row.selected_tests)) &&
      row.created_at === createdAt,
    `age=${row.age} yakap=${row.yakap_registered} checked_in_at=${row.checked_in_at}`
  )

  try {
    await conn.execute('UPDATE appointments SET status = ? WHERE id = ?', ['confirmed', uuid])
    const [same] = await conn.execute('SELECT status FROM appointments WHERE id = ?', [uuid])
    let changed = 1
    // same-value update must still report a matched row (CLIENT_FOUND_ROWS)
    const [res] = await conn.execute('UPDATE appointments SET status = ? WHERE id = ?', ['confirmed', uuid])
    changed = res.affectedRows
    add('UPDATE reports matched rows even when values are unchanged', changed === 1 && same[0].status === 'confirmed', `affectedRows=${changed}`)
  } catch (e) {
    add('UPDATE reports matched rows even when values are unchanged', false, note(e))
  }

  try {
    await conn.execute('UPDATE appointments SET status = ? WHERE id = ?', ['not-a-status', uuid])
    add('CHECK constraint rejects an invalid status', false, 'insert succeeded')
  } catch (e) {
    add('CHECK constraint rejects an invalid status', /check constraint/i.test(note(e)), note(e))
  }
  try {
    await conn.execute('UPDATE appointments SET age = ? WHERE id = ?', [0, uuid])
    add('CHECK constraint rejects an out-of-range age', false, 'update succeeded')
  } catch (e) {
    add('CHECK constraint rejects an out-of-range age', /check constraint/i.test(note(e)), note(e))
  }

  try {
    await conn.execute(
      'INSERT INTO admin_sessions (token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?)',
      [randomBytes(32).toString('hex'), 'missing-admin@example.com', 9999999999, 1700000000]
    )
    add('FK rejects a session for a non-existent admin', false, 'insert succeeded')
  } catch (e) {
    add('FK rejects a session for a non-existent admin', /foreign key|referential/i.test(note(e)), note(e))
  }

  const tokenHash = randomBytes(32).toString('hex')
  const nowSec = Math.floor(Date.now() / 1000)
  await conn.execute(
    'INSERT INTO admin_sessions (token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?)',
    [tokenHash, adminEmail, nowSec + 3600, nowSec]
  )
  await conn.execute('DELETE FROM admin_users WHERE email = ?', [adminEmail])
  const [cascade] = await conn.execute('SELECT COUNT(*) AS c FROM admin_sessions WHERE email = ?', [adminEmail])
  add('FK ON DELETE CASCADE removes sessions with the admin', Number(cascade[0].c) === 0, `left=${cascade[0].c}`)
  // re-create the admin for the HTTP tests
  await conn.execute('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)', [
    adminEmail,
    hashPassword(adminPassword),
  ])

  // ---------- 2b. ported scripts, same env the app gets ----------
  const runScript = (rel, extra = {}) =>
    spawnSync(process.execPath, [resolve(process.cwd(), rel)], {
      env: { ...env, ...extra },
      cwd: process.cwd(),
      encoding: 'utf8',
    })

  const checkRun = runScript('scripts/check-database.mjs')
  add(
    'scripts/check-database.mjs reports a healthy schema',
    checkRun.status === 0 && /Database check complete/.test(checkRun.stdout || ''),
    `exit=${checkRun.status}`
  )

  const seedEmail = 'seeded-admin@example.com'
  const seedPassword = randomBytes(16).toString('base64')
  const seedPassword2 = randomBytes(16).toString('base64')
  let seedRun = runScript('scripts/seed-admin.mjs', {
    CHO_ADMIN_EMAIL: seedEmail,
    CHO_ADMIN_PASSWORD: seedPassword,
  })
  const [seedRows1] = await conn.execute('SELECT password_hash FROM admin_users WHERE email = ?', [seedEmail])
  add(
    'scripts/seed-admin.mjs creates an admin with a scrypt hash',
    seedRun.status === 0 && seedRows1.length === 1 && /^scrypt\$/.test(seedRows1[0].password_hash || ''),
    `exit=${seedRun.status} rows=${seedRows1.length}`
  )

  seedRun = runScript('scripts/seed-admin.mjs', {
    CHO_ADMIN_EMAIL: seedEmail,
    CHO_ADMIN_PASSWORD: seedPassword2,
  })
  const [seedRows2] = await conn.execute('SELECT password_hash FROM admin_users WHERE email = ?', [seedEmail])
  add(
    're-running seed-admin upserts (one row, new password hash)',
    seedRun.status === 0 && seedRows2.length === 1 && seedRows2[0].password_hash !== seedRows1[0].password_hash,
    `exit=${seedRun.status} rows=${seedRows2.length}`
  )

  // ---------- 3. start the app ----------
  server = spawn(
    process.execPath,
    [resolve(process.cwd(), 'node_modules/next/dist/bin/next'), 'start', '-p', String(PORT)],
    { env, cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }
  )
  let serverLog = ''
  server.stdout.on('data', (d) => { serverLog += d.toString() })
  server.stderr.on('data', (d) => { serverLog += d.toString() })

  const ready = await waitForServer()
  add('production server starts against MySQL', ready, ready ? '' : serverLog.slice(-400))
  if (!ready) throw new Error('server did not start')

  // ---------- 4. patient flows ----------
  let res = await fetch(`${BASE}/api/quotas?date=${LOCAL_TODAY}`, { headers: { 'X-Forwarded-For': '203.0.113.10' } })
  const quotas = await res.json().catch(() => ({}))
  add(
    'GET /api/quotas (public) -> 200 with count objects',
    res.status === 200 && typeof quotas.counts === 'object' && typeof quotas.walkinCounts === 'object',
    `status=${res.status}`
  )

  res = await fetch(`${BASE}/api/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.11' },
    body: JSON.stringify(booking()),
  })
  const created = await res.json().catch(() => ({}))
  add(
    'POST /api/appointments -> 201 + UUID (QR payload)',
    res.status === 201 && created.success === true &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(created.id || ''),
    `status=${res.status} id=${created.id}`
  )
  const aptId = created.id

  res = await fetch(`${BASE}/api/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.12' },
    body: JSON.stringify(booking({ last_name: 'Percent%Test', first_name: 'Alpha' })),
  })
  const percentCreated = await res.json().catch(() => ({}))
  add('POST booking with a literal % in the name -> 201', res.status === 201, `status=${res.status}`)

  res = await fetch(`${BASE}/api/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.13' },
    body: JSON.stringify(booking({ selected_tests: [] })),
  })
  add('POST booking with no tests -> 400', res.status === 400, `status=${res.status}`)

  // ---------- 5. authorization ----------
  res = await fetch(`${BASE}/api/appointments`, { headers: { 'X-Forwarded-For': '203.0.113.14' } })
  add('GET /api/appointments without session -> 401', res.status === 401, `status=${res.status}`)

  res = await fetch(`${BASE}/api/appointments/${aptId}`, { headers: { 'X-Forwarded-For': '203.0.113.14' } })
  add('GET /api/appointments/:id without session -> 401 (no IDOR)', res.status === 401, `status=${res.status}`)

  res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.20', 'X-Forwarded-Proto': 'https' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword + 'x' }),
  })
  add('login with wrong password -> 401', res.status === 401, `status=${res.status}`)

  // ---------- 6. admin flows ----------
  res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.20', 'X-Forwarded-Proto': 'https' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  })
  const loginJson = await res.json().catch(() => ({}))
  const { sc: loginSc, token } = cookieOf(res)
  add(
    'login -> 200 + HttpOnly/Secure/SameSite session cookie',
    res.status === 200 && loginJson.ok === true && Boolean(token) &&
      /HttpOnly/i.test(loginSc) && /Secure/i.test(loginSc) && /SameSite=Lax/i.test(loginSc),
    `status=${res.status}`
  )
  const auth = { Cookie: `cho_admin_session=${token}`, 'X-Forwarded-For': '198.51.100.20' }

  res = await fetch(`${BASE}/api/admin/me`, { headers: auth })
  const me = await res.json().catch(() => ({}))
  add('GET /api/admin/me -> 200 + own email', res.status === 200 && me.email === adminEmail, `status=${res.status}`)

  res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.22', 'X-Forwarded-Proto': 'https' },
    body: JSON.stringify({ email: seedEmail, password: seedPassword2 }),
  })
  add(
    'login works for the admin seeded by scripts/seed-admin.mjs',
    res.status === 200,
    `status=${res.status}`
  )

  res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.22', 'X-Forwarded-Proto': 'https' },
    body: JSON.stringify({ email: seedEmail, password: seedPassword }),
  })
  add(
    'previous seed password is rejected after re-seeding',
    res.status === 401,
    `status=${res.status}`
  )

  res = await fetch(`${BASE}/api/appointments?limit=50`, { headers: auth })
  const list = await res.json().catch(() => ({}))
  add(
    'GET /api/appointments (admin) -> 200 + numeric total',
    res.status === 200 && Array.isArray(list.data) && typeof list.total === 'number',
    `status=${res.status} total=${list.total} type=${typeof list.total}`
  )

  res = await fetch(`${BASE}/api/appointments?search=${encodeURIComponent('Percent%Test')}`, { headers: auth })
  const searchPct = await res.json().catch(() => ({}))
  const pctIds = (searchPct.data || []).map((d) => d.id)
  add(
    "search treats % as a literal (LIKE escape)",
    res.status === 200 && pctIds.length === 1 && pctIds[0] === percentCreated.id,
    `matched=${pctIds.length}`
  )

  res = await fetch(`${BASE}/api/appointments?search=${aptId}`, { headers: auth })
  const searchId = await res.json().catch(() => ({}))
  add(
    'search by exact appointment id (QR/confirmation paste)',
    res.status === 200 && (searchId.data || []).length === 1 && searchId.data[0].id === aptId,
    `matched=${(searchId.data || []).length}`
  )

  // seed one confirmed row straight in MySQL so the status filter has data
  const confirmedId = '33333333-4444-4555-8666-777777777777'
  await conn.execute(
    `INSERT INTO appointments
      (id, patient_name, last_name, first_name, middle_name, birthdate, age, contact_number,
       consultation_facility, yakap_registered, yakap_facility, selected_tests, appointment_date,
       status, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'online', ?)`,
    [confirmedId, 'Confirmed, Row', 'Confirmed', 'Row', '', '1988-01-01', 38, '09171234568',
      FACILITY, 0, null, JSON.stringify(['Urinalysis']), LOCAL_TODAY, new Date().toISOString()]
  )

  res = await fetch(`${BASE}/api/appointments?status=confirmed`, { headers: auth })
  const byStatus = await res.json().catch(() => ({}))
  add(
    'filter by status=confirmed returns only confirmed rows',
    res.status === 200 && (byStatus.data || []).length >= 1 &&
      (byStatus.data || []).every((d) => d.status === 'confirmed'),
    `matched=${(byStatus.data || []).length}`
  )

  res = await fetch(`${BASE}/api/appointments?date=${LOCAL_TODAY}`, { headers: auth })
  const byDate = await res.json().catch(() => ({}))
  add(
    'filter by date returns only that day',
    res.status === 200 && (byDate.data || []).every((d) => d.appointment_date === LOCAL_TODAY),
    `matched=${(byDate.data || []).length}`
  )

  res = await fetch(`${BASE}/api/appointments?search=${encodeURIComponent('Del Cruz')}`, { headers: auth })
  const searchNone = await res.json().catch(() => ({}))
  add('search with no match -> 200 + empty data', res.status === 200 && (searchNone.data || []).length === 0, `matched=${(searchNone.data || []).length}`)

  res = await fetch(`${BASE}/api/appointments/${aptId}`, { headers: auth })
  const one = await res.json().catch(() => ({}))
  add(
    'GET /api/appointments/:id (QR scan lookup) -> 200',
    res.status === 200 && one.data?.id === aptId && Array.isArray(one.data?.selected_tests),
    `status=${res.status}`
  )

  res = await fetch(`${BASE}/api/appointments/${aptId}`, {
    method: 'PATCH',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'confirmed' }),
  })
  add('PATCH status pending -> confirmed -> 200', res.status === 200, `status=${res.status}`)

  res = await fetch(`${BASE}/api/appointments/${aptId}`, {
    method: 'PATCH',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'confirmed' }),
  })
  add('PATCH status confirmed -> confirmed (idempotent) -> 200', res.status === 200, `status=${res.status}`)

  res = await fetch(`${BASE}/api/appointments/${aptId}`, {
    method: 'PATCH',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' }),
  })
  add('PATCH status confirmed -> cancelled -> 200', res.status === 200, `status=${res.status}`)

  res = await fetch(`${BASE}/api/appointments/${aptId}`, {
    method: 'PATCH',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'completed' }),
  })
  add('PATCH blocked transition cancelled -> completed -> 409', res.status === 409, `status=${res.status}`)

  res = await fetch(`${BASE}/api/appointments/${aptId}`, {
    method: 'PATCH',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'confirmed' }),
  })
  add('PATCH restore cancelled -> confirmed -> 200', res.status === 200, `status=${res.status}`)

  // ---------- 7. walk-in ----------
  res = await fetch(`${BASE}/api/admin/walkins`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(booking({ first_name: 'Walkin', last_name: 'Patient', middle_name: '' })),
  })
  const walkin = await res.json().catch(() => ({}))
  add('POST /api/admin/walkins -> 201', res.status === 201 && Boolean(walkin.id), `status=${res.status}`)

  const [walkinRows] = await conn.execute('SELECT status, source FROM appointments WHERE id = ?', [walkin.id])
  add(
    'walk-in row stores status=confirmed and source=walkin',
    walkinRows[0]?.status === 'confirmed' && walkinRows[0]?.source === 'walkin',
    `status=${walkinRows[0]?.status} source=${walkinRows[0]?.source}`
  )

  // ---------- 8. QR check-in (one-time) ----------
  await conn.execute('UPDATE appointments SET appointment_date = ? WHERE id = ?', [MANILA_TODAY, aptId])
  res = await fetch(`${BASE}/api/appointments/${aptId}/check-in`, { method: 'POST', headers: auth })
  const checkin = await res.json().catch(() => ({}))
  add(
    'POST check-in on the appointment date -> 200 + checked_in_at',
    res.status === 200 && typeof checkin.checked_in_at === 'string',
    `status=${res.status}`
  )

  res = await fetch(`${BASE}/api/appointments/${aptId}/check-in`, { method: 'POST', headers: auth })
  const checkin2 = await res.json().catch(() => ({}))
  add(
    'second check-in with the same QR -> 409 (one-time use)',
    res.status === 409 && typeof checkin2.checked_in_at === 'string',
    `status=${res.status}`
  )

  res = await fetch(`${BASE}/api/appointments/not-a-uuid/check-in`, { method: 'POST', headers: auth })
  add('check-in with a malformed id -> 400', res.status === 400, `status=${res.status}`)

  // ---------- 9. full edit + delete ----------
  res = await fetch(`${BASE}/api/appointments/${aptId}`, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(booking({ first_name: 'Juanito', middle_name: 'M', selected_tests: ['CBC', 'Urinalysis'] })),
  })
  add('PUT full edit -> 200', res.status === 200, `status=${res.status}`)

  const [edited] = await conn.execute(
    'SELECT first_name, selected_tests FROM appointments WHERE id = ?',
    [aptId]
  )
  add(
    'PUT edit persisted split names + selected_tests JSON',
    edited[0]?.first_name === 'Juanito' &&
      Array.isArray(JSON.parse(edited[0]?.selected_tests || '[]')) &&
      JSON.parse(edited[0]?.selected_tests).length === 2,
    `first_name=${edited[0]?.first_name}`
  )

  res = await fetch(`${BASE}/api/appointments/${percentCreated.id}`, {
    method: 'DELETE',
    headers: auth,
  })
  add('DELETE appointment -> 200', res.status === 200, `status=${res.status}`)

  res = await fetch(`${BASE}/api/appointments/${percentCreated.id}`, { headers: auth })
  add('GET deleted appointment -> 404', res.status === 404, `status=${res.status}`)

  // ---------- 10. admin-blocked dates ----------
  const beforeBlock = await conn.execute(
    "SELECT COUNT(*) AS c FROM appointments WHERE appointment_date = ? AND status <> 'cancelled'",
    [LOCAL_TODAY]
  )
  const keptCount = Number(beforeBlock[0][0].c)

  res = await fetch(`${BASE}/api/admin/blocked-dates`, { headers: { 'X-Forwarded-For': '198.51.100.40' } })
  add('admin blocked-dates without session -> 401', res.status === 401, `status=${res.status}`)

  res = await fetch(`${BASE}/api/blocked-dates`, { headers: { 'X-Forwarded-For': '203.0.113.15' } })
  const publicEmpty = await res.json().catch(() => ({}))
  add(
    'GET /api/blocked-dates (public) -> 200 + array',
    res.status === 200 && Array.isArray(publicEmpty.blocked),
    `status=${res.status}`
  )

  const blockNote = 'Lab closed for inventory'
  res = await fetch(`${BASE}/api/admin/blocked-dates`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.40' },
    body: JSON.stringify({ date: LOCAL_TODAY, note: blockNote }),
  })
  const blocked = await res.json().catch(() => ({}))
  add(
    'admin blocks a date -> 200 + created + appointment count',
    res.status === 200 && blocked.created === true && Number(blocked.appointments) === keptCount,
    `status=${res.status} created=${blocked.created} appointments=${blocked.appointments}`
  )

  const afterBlock = await conn.execute(
    "SELECT COUNT(*) AS c FROM appointments WHERE appointment_date = ? AND status <> 'cancelled'",
    [LOCAL_TODAY]
  )
  add(
    'blocking left existing appointments untouched',
    Number(afterBlock[0][0].c) === keptCount && keptCount >= 1,
    `before=${keptCount} after=${afterBlock[0][0].c}`
  )

  res = await fetch(`${BASE}/api/blocked-dates`, { headers: { 'X-Forwarded-For': '203.0.113.16' } })
  const publicBlocked = await res.json().catch(() => ({}))
  const pubRow = (publicBlocked.blocked || []).find((b) => b.date === LOCAL_TODAY)
  add(
    'public list includes the blocked date + note',
    res.status === 200 && pubRow && pubRow.note === blockNote,
    `note=${pubRow ? pubRow.note : 'missing'}`
  )

  res = await fetch(`${BASE}/api/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.18' },
    body: JSON.stringify(booking()),
  })
  const refused = await res.json().catch(() => ({}))
  add(
    'patient booking on a blocked date -> 409 + note',
    res.status === 409 &&
      /unavailable/i.test(refused.error || '') &&
      String((refused.details || []).join(' ')).includes(blockNote),
    `status=${res.status}`
  )

  res = await fetch(`${BASE}/api/admin/walkins`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.41' },
    body: JSON.stringify(booking({ first_name: 'Blocked', last_name: 'Walkin', middle_name: '' })),
  })
  const refusedWalkin = await res.json().catch(() => ({}))
  add(
    'walk-in on a blocked date -> 409',
    res.status === 409 && String(refusedWalkin.error || '').includes(blockNote),
    `status=${res.status}`
  )

  res = await fetch(`${BASE}/api/admin/blocked-dates`, { headers: auth })
  const adminList = await res.json().catch(() => ({}))
  const adminRow = (adminList.blocked || []).find((b) => b.date === LOCAL_TODAY)
  add(
    'admin list shows the date with its kept appointments',
    res.status === 200 && adminRow && adminRow.note === blockNote && Number(adminRow.appointments) === keptCount,
    `appointments=${adminRow ? adminRow.appointments : 'missing'}`
  )

  res = await fetch(`${BASE}/api/admin/blocked-dates?date=${LOCAL_TODAY}`, { headers: auth })
  const candidate = await res.json().catch(() => ({}))
  add(
    'candidate check reports blocked + count for that date',
    res.status === 200 && candidate.blocked === true && Number(candidate.appointments) === keptCount,
    `blocked=${candidate.blocked} appointments=${candidate.appointments}`
  )

  const openDate = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  })()
  res = await fetch(`${BASE}/api/admin/blocked-dates?date=${openDate}`, { headers: auth })
  const openCandidate = await res.json().catch(() => ({}))
  add(
    'candidate check reports an open date as not blocked',
    res.status === 200 && openCandidate.blocked === false && openCandidate.date === openDate,
    `blocked=${openCandidate.blocked}`
  )

  res = await fetch(`${BASE}/api/admin/blocked-dates`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2020-01-01' }),
  })
  add('blocking a past date -> 400', res.status === 400, `status=${res.status}`)

  res = await fetch(`${BASE}/api/admin/blocked-dates`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: 'not-a-date' }),
  })
  add('blocking a malformed date -> 400', res.status === 400, `status=${res.status}`)

  res = await fetch(`${BASE}/api/admin/blocked-dates`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: LOCAL_TODAY, note: 'Updated reason' }),
  })
  const reblocked = await res.json().catch(() => ({}))
  add(
    're-blocking the same date is idempotent (updates the note)',
    res.status === 200 && reblocked.created === false,
    `status=${res.status} created=${reblocked.created}`
  )

  res = await fetch(`${BASE}/api/admin/blocked-dates`, {
    method: 'DELETE',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: LOCAL_TODAY }),
  })
  const unblocked = await res.json().catch(() => ({}))
  add(
    'admin unblocks the date -> 200 + removed',
    res.status === 200 && unblocked.removed === 1,
    `status=${res.status} removed=${unblocked.removed}`
  )

  res = await fetch(`${BASE}/api/blocked-dates`, { headers: { 'X-Forwarded-For': '203.0.113.19' } })
  const publicAfter = await res.json().catch(() => ({}))
  add(
    'public list no longer includes the unblocked date',
    res.status === 200 && !(publicAfter.blocked || []).some((b) => b.date === LOCAL_TODAY),
    `status=${res.status}`
  )

  res = await fetch(`${BASE}/api/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.20' },
    body: JSON.stringify(booking()),
  })
  const reopened = await res.json().catch(() => ({}))
  add(
    'booking works again after the date is unblocked',
    res.status === 201 && Boolean(reopened.id),
    `status=${res.status}`
  )

  // ---------- 11. the pre-existing auth suite, against this same server ----
  const authRun = spawnSync(
    process.execPath,
    [resolve(process.cwd(), 'security-tests/auth-e2e.mjs')],
    { env: { ...env, E2E_BASE_URL: BASE, E2E_MODE: 'production' }, cwd: process.cwd(), encoding: 'utf8' }
  )
  console.log((authRun.stdout || '').trimEnd())
  if (authRun.stderr) console.error(authRun.stderr.trimEnd())
  add('security-tests/auth-e2e.mjs passes against MySQL', authRun.status === 0, `exit=${authRun.status}`)

  // ---------- 12. session lifetime ----------
  await conn.execute('UPDATE admin_sessions SET expires_at = ? WHERE token_hash = ?', [
    Math.floor(Date.now() / 1000) - 60,
    hashToken(token),
  ])
  res = await fetch(`${BASE}/api/admin/me`, { headers: auth })
  add('expired session -> 401 on /api/admin/me', res.status === 401, `status=${res.status}`)

  res = await fetch(`${BASE}/api/appointments`, { headers: auth })
  add('expired session -> 401 on admin list', res.status === 401, `status=${res.status}`)

  // fresh login for the logout flow
  res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.21', 'X-Forwarded-Proto': 'https' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  })
  const second = cookieOf(res)
  const auth2 = { Cookie: `cho_admin_session=${second.token}`, 'X-Forwarded-For': '198.51.100.21' }

  res = await fetch(`${BASE}/api/admin/logout`, {
    method: 'POST',
    headers: { ...auth2, 'X-Forwarded-Proto': 'https' },
  })
  const loSc = res.headers.get('set-cookie') || ''
  add('logout -> 200 + cookie cleared', res.status === 200 && /Max-Age=0/i.test(loSc), `status=${res.status}`)

  res = await fetch(`${BASE}/api/admin/me`, { headers: auth2 })
  add('admin/me after logout -> 401', res.status === 401, `status=${res.status}`)

  const [sessions] = await conn.execute(
    'SELECT COUNT(*) AS c FROM admin_sessions WHERE token_hash = ?',
    [hashToken(second.token)]
  )
  add('logout deleted the session row from MySQL', Number(sessions[0].c) === 0, `rows=${sessions[0].c}`)
} catch (e) {
  add('test run completed without crashing', false, note(e))
} finally {
  try {
    if (server) {
      const killed = server.kill('SIGTERM')
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(server.pid), '/f', '/t'])
      }
      if (!killed) add('server stopped', false, 'kill failed')
    }
  } catch { /* ignore */ }
  try { if (conn) await conn.end() } catch { /* ignore */ }
  try { if (db) await db.stop() } catch { /* ignore */ }
  }
}

async function waitForServer(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/quotas?date=${LOCAL_TODAY}`, {
        headers: { 'X-Forwarded-For': '203.0.113.99' },
      })
      if (r.status === 200) return true
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

await main()

console.log('')
for (const r of results) console.log(`${r.Result}  ${r.Test}${r.Notes ? '  | ' + r.Notes : ''}`)
const pass = results.filter((r) => r.Result === 'PASS').length
const fail = results.filter((r) => r.Result === 'FAIL').length
console.log(`\nPASS: ${pass}  FAIL: ${fail}`)
process.exitCode = fail > 0 ? 1 : 0
