// Tests the build-mode guard in next.config.ts — run with:
//   node security-tests/build-guard-test.mjs
// Verifies that `next build` REFUSES to run when NEXT_PUBLIC_APP_MODE=admin,
// that the failure is our explicit message (not an unrelated crash), and that
// the failed attempt does not touch an existing .next build artifact.
// `next dev` / `next start` are unaffected (phase-scoped guard) — `next start`
// is exercised by mysql-e2e.mjs, which loads the same config with a production
// phase.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const nextBin = resolve(root, 'node_modules', 'next', 'dist', 'bin', 'next')
const buildIdPath = resolve(root, '.next', 'BUILD_ID')
const buildIdBefore = existsSync(buildIdPath) ? readFileSync(buildIdPath, 'utf8') : null

let fail = 0
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` (${detail})`}`)
  if (!ok) fail++
}

console.log('build-guard: running `next build` with NEXT_PUBLIC_APP_MODE=admin (expect refusal)')
const started = Date.now()
const r = spawnSync(process.execPath, [nextBin, 'build'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, NEXT_PUBLIC_APP_MODE: 'admin' },
  timeout: 300_000,
})
const elapsed = Date.now() - started
const out = `${r.stdout || ''}\n${r.stderr || ''}`

check('build exits non-zero', r.status !== 0, `status=${r.status}`)
check(
  'failure carries the explicit guard message',
  out.includes('Refusing to build: NEXT_PUBLIC_APP_MODE=admin'),
  out.split('\n').filter((l) => l.trim()).slice(-6).join(' | ').slice(0, 400)
)
check(
  'failure is fast (guard fires before compilation)',
  elapsed < 120_000,
  `${(elapsed / 1000).toFixed(1)}s`
)

const buildIdAfter = existsSync(buildIdPath) ? readFileSync(buildIdPath, 'utf8') : null
check(
  'existing .next build artifact untouched by the refused build',
  buildIdBefore === buildIdAfter,
  `before=${buildIdBefore} after=${buildIdAfter}`
)

console.log(`\nbuild-guard: ${fail === 0 ? 'all checks passed' : `${fail} FAILED`} (${((elapsed / 1000) | 0)}s)`)
process.exit(fail === 0 ? 0 : 1)
