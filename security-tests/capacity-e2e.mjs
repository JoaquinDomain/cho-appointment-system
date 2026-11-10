// Admin-managed online + walk-in capacity E2E test.
//
// Boots throwaway MySQL 8.0, applies ./mysql/schema.sql, starts the production
// Next.js server, and verifies the capacity feature end to end:
// persistence, authorization, validation, patient bookings, cancelled/walk-in
// counting, per-date isolation, independent tests, zero capacity, concurrent
// last-slot booking, migration idempotence, and restart persistence.
//
// Run after `npm run build`:
//   node security-tests/capacity-e2e.mjs
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { randomBytes, randomUUID, scryptSync } from 'node:crypto'
import { resolve } from 'node:path'
import { createDB } from 'mysql-memory-server'
import mysql from 'mysql2/promise'

const PORT = Number(process.env.E2E_CAPACITY_PORT || 3101)
const BASE = `http://127.0.0.1:${PORT}`
const pad = (n) => String(n).padStart(2, '0')
const HOLIDAYS = new Set(
  [...readFileSync(resolve(process.cwd(), 'src/lib/dates/holidays.ts'), 'utf8').matchAll(/'(\d{4}-\d{2}-\d{2})'/g)].map(
    (m) => m[1]
  )
)
function openDateAfter(days) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  for (let i = 0; i < 400; i++) {
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const day = d.getDay()
    if (day !== 0 && day <= 5 && !HOLIDAYS.has(iso)) return iso
    d.setDate(d.getDate() + 1)
  }
  throw new Error('no open lab date found')
}

const DATE_A = openDateAfter(0)
const DATE_B = openDateAfter(14)
const DATE_C = openDateAfter(21)
const DATE_D = openDateAfter(28)
const FACILITY = 'CHO Main / Bacolod City Health Office'

const results = []
function add(name, ok, notes = '') {
  results.push({ name, ok, notes })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${notes ? `  (${notes})` : ''}`)
}
const note = (e) => String(e && e.message ? e.message : e).slice(0, 240)

function hashPassword(pw) {
  const salt = randomBytes(16).toString('base64')
  const hash = scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')
  return `scrypt$v=1$n=16384$r=8$p=1$${salt}$${hash}`
}

function booking(overrides = {}) {
  return {
    last_name: 'Capacity',
    first_name: 'Patient',
    middle_name: '',
    birthdate: '1990-05-12',
    contact_number: '09171234567',
    consultation_facility: FACILITY,
    yakap_registered: false,
    yakap_facility: null,
    selected_tests: ['CBC'],
    appointment_date: DATE_A,
    turnstileUnavailable: true,
    website: '',
    formStartedAt: Date.now() - 5000,
    ...overrides,
  }
}

let ipCounter = 0
function nextIp() {
  ipCounter += 1
  return `198.18.${Math.floor(ipCounter / 250) % 250}.${(ipCounter % 250) + 1}`
}

async function postBooking(overrides = {}, ip = nextIp()) {
  const res = await fetch(`${BASE}/api/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify(booking(overrides)),
  })
  const json = await res.json().catch(() => ({}))
  return { res, json }
}

let server = null
let serverLog = ''
let db = null
let conn = null

function startServer(env) {
  serverLog = ''
  server = spawn(
    process.execPath,
    [resolve(process.cwd(), 'node_modules/next/dist/bin/next'), 'start', '-p', String(PORT)],
    { env, cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }
  )
  server.stdout.on('data', (d) => { serverLog += d.toString() })
  server.stderr.on('data', (d) => { serverLog += d.toString() })
}

async function stopServer() {
  if (!server) return
  try {
    server.kill('SIGTERM')
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(server.pid), '/f', '/t'])
    }
  } catch { /* ignore */ }
  await new Promise((r) => setTimeout(r, 750))
  server = null
}

async function waitForServer(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/quotas?date=${DATE_A}`, {
        headers: { 'X-Forwarded-For': nextIp() },
      })
      if (r.status === 200) return true
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

async function insertOnline(appointmentDate, tests, status = 'pending') {
  const id = randomUUID()
  await conn.execute(
    `INSERT INTO appointments
      (id, patient_name, last_name, first_name, middle_name, birthdate, age, contact_number,
       consultation_facility, yakap_registered, yakap_facility, selected_tests, appointment_date,
       status, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'online', ?)`,
    [id, 'Capacity, Row', 'Capacity', 'Row', '', '1990-05-12', 36, '09171234567',
      FACILITY, 0, null, JSON.stringify(tests), appointmentDate, status, new Date().toISOString()]
  )
  return id
}

async function main() {
  try {
    console.log('Starting MySQL 8.0...')
    db = await createDB({
      version: '8.0.x',
      dbName: 'bcho_lab_appointment',
      xEnabled: 'OFF',
      logLevel: 'ERROR',
    })
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

    const adminEmail = 'capacity-admin@example.com'
    const adminPassword = randomBytes(16).toString('base64')
    await conn.execute('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)', [
      adminEmail,
      hashPassword(adminPassword),
    ])

    const [capacityTables] = await conn.query(
      "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'test_capacities'"
    )
    const [seeded] = await conn.query('SELECT COUNT(*) AS c FROM test_capacities')
    add(
      'schema creates test_capacities with one seeded row per test',
      capacityTables.length === 1 && Number(seeded[0].c) === 17,
      `rows=${seeded[0].c}`
    )
    const [walkinColumn] = await conn.query(
      "SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'test_capacities' AND column_name = 'max_walkin_capacity'"
    )
    const [seededWalkin] = await conn.execute(
      'SELECT max_walkin_capacity FROM test_capacities WHERE test_label = ?',
      ['CBC']
    )
    add(
      'schema seeds the walk-in capacity column with the previous half split',
      walkinColumn.length === 1 && Number(seededWalkin[0]?.max_walkin_capacity) === 50,
      `columns=${walkinColumn.length} cbc=${seededWalkin[0]?.max_walkin_capacity}`
    )

    const env = {
      ...process.env,
      NODE_ENV: 'production',
      MYSQL_HOST: '127.0.0.1',
      MYSQL_PORT: String(db.port),
      MYSQL_DATABASE: db.dbName,
      MYSQL_USER: db.username,
      MYSQL_PASSWORD: '',
      TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY || 'test-secret',
      RL_BOOK_UNVERIFIED_IP: '1000',
    }
    startServer(env)
    const ready = await waitForServer()
    add('production server starts against MySQL', ready, ready ? '' : serverLog.slice(-400))
    if (!ready) throw new Error('server did not start')

    let res = await fetch(`${BASE}/api/quotas?date=${DATE_A}`, { headers: { 'X-Forwarded-For': nextIp() } })
    let json = await res.json().catch(() => ({}))
    add(
      'public quotas expose seeded capacities and availability',
      res.status === 200 && json.capacities?.CBC === 50 && json.available?.CBC === 50 &&
        json.walkinCapacities?.CBC === 50 && json.walkinAvailable?.CBC === 50,
      `status=${res.status} cbc=${json.capacities?.CBC} available=${json.available?.CBC} walkin=${json.walkinCapacities?.CBC}`
    )

    res = await fetch(`${BASE}/api/admin/capacities?date=${DATE_A}`, { headers: { 'X-Forwarded-For': nextIp() } })
    add('GET /api/admin/capacities without session -> 401', res.status === 401, `status=${res.status}`)
    res = await fetch(`${BASE}/api/admin/capacities`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': nextIp() },
      body: JSON.stringify({ test_label: 'CBC', max_online_capacity: 1 }),
    })
    add('PATCH /api/admin/capacities without session -> 401', res.status === 401, `status=${res.status}`)

    res = await fetch(`${BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': nextIp(), 'X-Forwarded-Proto': 'https' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    })
    const sc = res.headers.get('set-cookie') || ''
    const token = (sc.match(/cho_admin_session=([0-9a-f]{64})/) || [])[1]
    const auth = { Cookie: `cho_admin_session=${token}`, 'X-Forwarded-For': nextIp() }
    add('admin login succeeds', res.status === 200 && Boolean(token), `status=${res.status}`)
    if (!token) throw new Error('no admin session token')

    res = await fetch(`${BASE}/api/admin/capacities?date=${DATE_A}`, { headers: auth })
    json = await res.json().catch(() => ({}))
    const cbcSummary = (json.tests || []).find((t) => t.label === 'CBC')
    add(
      'GET /api/admin/capacities (admin) -> capacity + counted + available per test',
      res.status === 200 && cbcSummary?.maxOnlineCapacity === 50 &&
        cbcSummary?.maxWalkinCapacity === 50 &&
        cbcSummary?.counted === 0 && cbcSummary?.available === 50,
      `status=${res.status} tests=${(json.tests || []).length} walkin=${cbcSummary?.maxWalkinCapacity}`
    )

    const patch = async (body) => {
      const r = await fetch(`${BASE}/api/admin/capacities`, {
        method: 'PATCH',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return { res: r, json: await r.json().catch(() => ({})) }
    }

    let patched = await patch({ test_label: 'CBC', max_online_capacity: 2, date: DATE_A })
    add(
      'admin saves CBC online capacity 2 -> 200 + updated summary',
      patched.res.status === 200 && patched.json.test?.maxOnlineCapacity === 2 &&
        patched.json.test?.maxWalkinCapacity === 50,
      `status=${patched.res.status} capacity=${patched.json.test?.maxOnlineCapacity} walkin=${patched.json.test?.maxWalkinCapacity}`
    )
    const [audit] = await conn.execute(
      'SELECT max_online_capacity, max_walkin_capacity, updated_by FROM test_capacities WHERE test_label = ?',
      ['CBC']
    )
    add(
      'capacity persists in MySQL and omitted walk-in keeps its saved value',
      Number(audit[0]?.max_online_capacity) === 2 &&
        Number(audit[0]?.max_walkin_capacity) === 50 &&
        audit[0]?.updated_by === adminEmail,
      `capacity=${audit[0]?.max_online_capacity} walkin=${audit[0]?.max_walkin_capacity} by=${audit[0]?.updated_by}`
    )
    patched = await patch({
      test_label: 'CBC',
      max_online_capacity: 2,
      max_walkin_capacity: 4,
      date: DATE_A,
    })
    add(
      'admin saves online and walk-in capacity together -> 200 + updated summary',
      patched.res.status === 200 && patched.json.test?.maxOnlineCapacity === 2 &&
        patched.json.test?.maxWalkinCapacity === 4 &&
        patched.json.walkinCapacities?.CBC === 4,
      `status=${patched.res.status} online=${patched.json.test?.maxOnlineCapacity} walkin=${patched.json.test?.maxWalkinCapacity}`
    )
    res = await fetch(`${BASE}/api/quotas?date=${DATE_A}`, { headers: { 'X-Forwarded-For': nextIp() } })
    json = await res.json().catch(() => ({}))
    add(
      'public availability reflects the saved capacity immediately',
      json.capacities?.CBC === 2 && json.available?.CBC === 2,
      `capacity=${json.capacities?.CBC} available=${json.available?.CBC}`
    )

    for (const [name, body] of [
      ['negative capacity -> 400', { test_label: 'CBC', max_online_capacity: -1 }],
      ['decimal capacity -> 400', { test_label: 'CBC', max_online_capacity: 1.5 }],
      ['negative walk-in capacity -> 400', { test_label: 'CBC', max_online_capacity: 2, max_walkin_capacity: -1 }],
      ['decimal walk-in capacity -> 400', { test_label: 'CBC', max_online_capacity: 2, max_walkin_capacity: 1.5 }],
      ['unknown test -> 400', { test_label: 'Not A Test', max_online_capacity: 1 }],
      ['missing capacity -> 400', { test_label: 'CBC' }],
    ]) {
      const bad = await patch(body)
      add(name, bad.res.status === 400, `status=${bad.res.status}`)
    }

    await insertOnline(DATE_A, ['CBC'])
    res = await fetch(`${BASE}/api/quotas?date=${DATE_A}`, { headers: { 'X-Forwarded-For': nextIp() } })
    json = await res.json().catch(() => ({}))
    add(
      'counted online appointment reduces availability',
      json.counts?.CBC === 1 && json.available?.CBC === 1,
      `counted=${json.counts?.CBC} available=${json.available?.CBC}`
    )
    res = await fetch(`${BASE}/api/admin/capacities?date=${DATE_A}`, { headers: auth })
    json = await res.json().catch(() => ({}))
    const countedSummary = (json.tests || []).find((t) => t.label === 'CBC')
    add(
      'admin dashboard view reports counted appointments separately',
      res.status === 200 && countedSummary?.counted === 1 &&
        countedSummary?.maxOnlineCapacity === 2 && countedSummary?.available === 1,
      `counted=${countedSummary?.counted} available=${countedSummary?.available}`
    )

    let booked = await postBooking({ appointment_date: DATE_A })
    add('booking the last online slot -> 201', booked.res.status === 201, `status=${booked.res.status}`)
    const fullBookingId = booked.json.id

    res = await fetch(`${BASE}/api/quotas?date=${DATE_A}`, { headers: { 'X-Forwarded-For': nextIp() } })
    json = await res.json().catch(() => ({}))
    add(
      'full capacity reports 0 available',
      json.available?.CBC === 0 && json.counts?.CBC === 2,
      `counted=${json.counts?.CBC} available=${json.available?.CBC}`
    )

    booked = await postBooking({ appointment_date: DATE_A })
    add(
      'booking over capacity -> 400 naming the test',
      booked.res.status === 400 && /CBC/.test(booked.json.error || ''),
      `status=${booked.res.status} error=${booked.json.error}`
    )

    await insertOnline(DATE_A, ['CBC'], 'cancelled')
    const completedId = await insertOnline(DATE_A, ['CBC'], 'completed')
    res = await fetch(`${BASE}/api/quotas?date=${DATE_A}`, { headers: { 'X-Forwarded-For': nextIp() } })
    json = await res.json().catch(() => ({}))
    add(
      'cancelled is excluded while completed still counts against capacity',
      json.counts?.CBC === 3 && json.available?.CBC === 0,
      `counted=${json.counts?.CBC}`
    )
    await conn.execute('UPDATE appointments SET status = ? WHERE id = ?', ['cancelled', completedId])

    res = await fetch(`${BASE}/api/admin/walkins`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(booking({ appointment_date: DATE_A })),
    })
    const walkin = await res.json().catch(() => ({}))
    add('walk-in still registers when online capacity is full', res.status === 201 && Boolean(walkin.id), `status=${res.status}`)

    res = await fetch(`${BASE}/api/quotas?date=${DATE_A}`, { headers: { 'X-Forwarded-For': nextIp() } })
    json = await res.json().catch(() => ({}))
    add(
      'walk-in does not consume an online slot',
      json.counts?.CBC === 2 && json.walkinCounts?.CBC === 1 && json.available?.CBC === 0,
      `online=${json.counts?.CBC} walkin=${json.walkinCounts?.CBC} available=${json.available?.CBC}`
    )

    patched = await patch({
      test_label: 'BUN',
      max_online_capacity: 5,
      max_walkin_capacity: 1,
      date: DATE_A,
    })
    add(
      'admin configures a walk-in capacity for BUN',
      patched.res.status === 200 && patched.json.test?.maxWalkinCapacity === 1,
      `status=${patched.res.status} walkin=${patched.json.test?.maxWalkinCapacity}`
    )
    const postWalkin = async (tests) => {
      const r = await fetch(`${BASE}/api/admin/walkins`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(booking({ appointment_date: DATE_A, selected_tests: tests })),
      })
      return { res: r, json: await r.json().catch(() => ({})) }
    }
    let walkinFit = await postWalkin(['BUN'])
    add(
      'walk-in within configured walk-in capacity -> 201',
      walkinFit.res.status === 201,
      `status=${walkinFit.res.status}`
    )
    walkinFit = await postWalkin(['BUN'])
    add(
      'walk-in over configured walk-in capacity -> 400',
      walkinFit.res.status === 400 && /BUN/.test(walkinFit.json.error || ''),
      `status=${walkinFit.res.status} error=${walkinFit.json.error}`
    )

    const [pending] = await conn.execute(
      "SELECT id FROM appointments WHERE appointment_date = ? AND selected_tests = ? AND source = 'online' AND status = 'pending' LIMIT 1",
      [DATE_A, JSON.stringify(['CBC'])]
    )
    await conn.execute('UPDATE appointments SET status = ? WHERE id = ?', ['cancelled', pending[0].id])
    res = await fetch(`${BASE}/api/quotas?date=${DATE_A}`, { headers: { 'X-Forwarded-For': nextIp() } })
    json = await res.json().catch(() => ({}))
    add(
      'cancelling a booking frees its online slot',
      json.available?.CBC === 1,
      `available=${json.available?.CBC}`
    )
    booked = await postBooking({ appointment_date: DATE_A })
    add('freed slot can be booked again', booked.res.status === 201, `status=${booked.res.status}`)

    res = await fetch(`${BASE}/api/quotas?date=${DATE_B}`, { headers: { 'X-Forwarded-For': nextIp() } })
    json = await res.json().catch(() => ({}))
    add(
      'capacity usage is isolated per appointment date',
      json.available?.CBC === 2 && json.counts?.CBC === undefined,
      `date=${DATE_B} available=${json.available?.CBC}`
    )

    patched = await patch({ test_label: 'Glucose (FBS)', max_online_capacity: 1, date: DATE_C })
    add('admin saves a second test independently', patched.res.status === 200, `status=${patched.res.status}`)
    patched = await patch({ test_label: 'CBC', max_online_capacity: 3, date: DATE_C })
    add('admin raises CBC for the independence test', patched.res.status === 200, `status=${patched.res.status}`)

    await insertOnline(DATE_C, ['Glucose (FBS)'])
    res = await fetch(`${BASE}/api/quotas?date=${DATE_C}`, { headers: { 'X-Forwarded-For': nextIp() } })
    json = await res.json().catch(() => ({}))
    add(
      'a full test does not reduce another test availability',
      json.available?.['Glucose (FBS)'] === 0 && json.available?.CBC === 3,
      `fbs=${json.available?.['Glucose (FBS)']} cbc=${json.available?.CBC}`
    )
    booked = await postBooking({ appointment_date: DATE_C, selected_tests: ['Glucose (FBS)'] })
    add('booking a full test -> 400', booked.res.status === 400, `status=${booked.res.status}`)
    booked = await postBooking({ appointment_date: DATE_C, selected_tests: ['CBC'] })
    add('booking an available test still succeeds', booked.res.status === 201, `status=${booked.res.status}`)

    patched = await patch({ test_label: 'HBsAg', max_online_capacity: 0, date: DATE_C })
    add('capacity 0 is accepted', patched.res.status === 200 && patched.json.test?.maxOnlineCapacity === 0, `status=${patched.res.status}`)
    booked = await postBooking({ appointment_date: DATE_C, selected_tests: ['HBsAg'] })
    add('capacity 0 blocks online booking', booked.res.status === 400, `status=${booked.res.status}`)

    patched = await patch({ test_label: 'Urinalysis', max_online_capacity: 5, date: DATE_D })
    add('capacity 5 configured for concurrency test', patched.res.status === 200, `status=${patched.res.status}`)
    const concurrent = await Promise.all(
      Array.from({ length: 12 }, () => postBooking({ appointment_date: DATE_D, selected_tests: ['Urinalysis'] }))
    )
    const successes = concurrent.filter((r) => r.res.status === 201).length
    const expectedFailures = concurrent.filter((r) => r.res.status === 400).length
    const [concurrentRows] = await conn.execute(
      "SELECT COUNT(*) AS c FROM appointments WHERE appointment_date = ? AND selected_tests = ? AND status <> 'cancelled'",
      [DATE_D, JSON.stringify(['Urinalysis'])]
    )
    add(
      'concurrent bookings never exceed the last online slot',
      successes === 5 && expectedFailures === 7 && Number(concurrentRows[0].c) === 5,
      `success=${successes} rejected=${expectedFailures} rows=${concurrentRows[0].c}`
    )

    patched = await patch({ test_label: 'CBC', max_online_capacity: 7, date: DATE_A })
    add('capacity can be raised above the previous full value', patched.res.status === 200, `status=${patched.res.status}`)

    await conn.query(readFileSync(resolve(process.cwd(), 'mysql/migrate_test_capacities.sql'), 'utf8'))
    const [afterMigration] = await conn.execute(
      'SELECT max_online_capacity, max_walkin_capacity FROM test_capacities WHERE test_label = ?',
      ['CBC']
    )
    const [afterRows] = await conn.query('SELECT COUNT(*) AS c FROM test_capacities')
    add(
      're-running the migration is idempotent and never overwrites admin values',
      Number(afterMigration[0]?.max_online_capacity) === 7 &&
        Number(afterMigration[0]?.max_walkin_capacity) === 4 &&
        Number(afterRows[0].c) === 17,
      `cbc=${afterMigration[0]?.max_online_capacity} walkin=${afterMigration[0]?.max_walkin_capacity} rows=${afterRows[0].c}`
    )

    await stopServer()
    startServer(env)
    const restarted = await waitForServer()
    add('server restarts after capacity changes', restarted, restarted ? '' : serverLog.slice(-400))
    res = await fetch(`${BASE}/api/quotas?date=${DATE_A}`, { headers: { 'X-Forwarded-For': nextIp() } })
    json = await res.json().catch(() => ({}))
    add(
      'capacity survives an application restart',
      res.status === 200 && json.capacities?.CBC === 7 &&
        json.walkinCapacities?.CBC === 4,
      `status=${res.status} cbc=${json.capacities?.CBC} walkin=${json.walkinCapacities?.CBC}`
    )

    res = await fetch(`${BASE}/api/admin/capacities?date=not-a-date`, { headers: auth })
    add('admin capacities with an invalid date -> 400', res.status === 400, `status=${res.status}`)

    const [beforeMigration] = await conn.query('SELECT COUNT(*) AS c FROM appointments')
    await conn.query('DROP TABLE test_capacities')
    await conn.query(readFileSync(resolve(process.cwd(), 'mysql/migrate_test_capacities.sql'), 'utf8'))
    const [afterMigrationRows] = await conn.query('SELECT COUNT(*) AS c FROM test_capacities')
    const [migrationCbc] = await conn.execute(
      'SELECT max_online_capacity FROM test_capacities WHERE test_label = ?',
      ['CBC']
    )
    const [afterMigrationAppointments] = await conn.query('SELECT COUNT(*) AS c FROM appointments')
    add(
      'migration from an old database is additive and preserves every appointment',
      Number(afterMigrationAppointments[0].c) === Number(beforeMigration[0].c) &&
        Number(afterMigrationRows[0].c) === 17 &&
        Number(migrationCbc[0]?.max_online_capacity) === 50,
      `appointments=${afterMigrationAppointments[0].c} rows=${afterMigrationRows[0].c}`
    )

    // Upgrade an old-shape table that already has admin-saved online values.
    await conn.query('DROP TABLE test_capacities')
    await conn.query(
      `CREATE TABLE test_capacities (
        test_label VARCHAR(120) NOT NULL,
        max_online_capacity INT UNSIGNED NOT NULL,
        updated_at VARCHAR(32) NOT NULL,
        updated_by VARCHAR(254) NOT NULL DEFAULT '',
        PRIMARY KEY (test_label),
        CONSTRAINT chk_test_capacities_max
          CHECK (max_online_capacity BETWEEN 0 AND 100000)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
    )
    await conn.execute(
      'INSERT INTO test_capacities (test_label, max_online_capacity, updated_at, updated_by) VALUES (?, ?, ?, ?)',
      ['CBC', 7, '2026-01-01T00:00:00.000Z', 'admin@example.com']
    )
    await conn.query(readFileSync(resolve(process.cwd(), 'mysql/migrate_test_capacities.sql'), 'utf8'))
    const [oldShapeColumn] = await conn.query(
      "SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'test_capacities' AND column_name = 'max_walkin_capacity'"
    )
    const [oldShapeCbc] = await conn.execute(
      'SELECT max_online_capacity, max_walkin_capacity FROM test_capacities WHERE test_label = ?',
      ['CBC']
    )
    const [oldShapeRows] = await conn.query('SELECT COUNT(*) AS c FROM test_capacities')
    add(
      'migration adds the walk-in column to an old table without resetting online values',
      oldShapeColumn.length === 1 &&
        Number(oldShapeCbc[0]?.max_online_capacity) === 7 &&
        Number(oldShapeCbc[0]?.max_walkin_capacity) === 50 &&
        Number(oldShapeRows[0].c) === 17,
      `columns=${oldShapeColumn.length} online=${oldShapeCbc[0]?.max_online_capacity} walkin=${oldShapeCbc[0]?.max_walkin_capacity} rows=${oldShapeRows[0].c}`
    )

    const [appointmentCount] = await conn.query('SELECT COUNT(*) AS c FROM appointments')
    add(
      'existing appointment rows remain present after all capacity changes',
      Number(appointmentCount[0].c) >= 13,
      `rows=${appointmentCount[0].c}`
    )

    void fullBookingId
  } catch (e) {
    add('test run completed without crashing', false, note(e))
  } finally {
    await stopServer()
    try { if (conn) await conn.end() } catch { /* ignore */ }
    try { if (db) await db.stop() } catch { /* ignore */ }
  }
}

await main()

console.log('')
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.notes ? `  | ${r.notes}` : ''}`)
const pass = results.filter((r) => r.ok).length
const fail = results.filter((r) => !r.ok).length
console.log(`\nPASS: ${pass}  FAIL: ${fail}`)
process.exitCode = fail > 0 ? 1 : 0
