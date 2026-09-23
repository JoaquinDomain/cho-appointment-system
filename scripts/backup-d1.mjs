#!/usr/bin/env node
/**
 * Full SQL backup of the Cloudflare D1 database via wrangler.
 *
 * Usage:   npm run backup:d1
 * Output:  backups/cho-appointments-<timestamp>.sql  (contains PHI — gitignored)
 *
 * Reads CLOUDFLARE_* from the environment or .env.local (if present).
 * The D1 API token doubles as the wrangler token when CLOUDFLARE_API_TOKEN
 * is not set separately.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

// minimal .env.local loader (no dotenv dependency)
const envFile = path.join(ROOT, '.env.local')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_D1_API_TOKEN } = process.env
if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_D1_DATABASE_ID || !CLOUDFLARE_D1_API_TOKEN) {
  console.error(
    'Missing env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_D1_API_TOKEN ' +
      '(set them in .env.local or the shell).'
  )
  process.exit(1)
}
if (!process.env.CLOUDFLARE_API_TOKEN) {
  process.env.CLOUDFLARE_API_TOKEN = CLOUDFLARE_D1_API_TOKEN
}

const outDir = path.join(ROOT, 'backups')
mkdirSync(outDir, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outFile = path.join(outDir, `cho-appointments-${stamp}.sql`)

console.log(`Exporting cho-appointments -> ${path.relative(ROOT, outFile)}`)

const child = spawn(
  'npx',
  ['wrangler', 'd1', 'export', 'cho-appointments', '--remote', `--output=${outFile}`],
  { cwd: ROOT, stdio: 'inherit', shell: true, env: process.env }
)

child.on('exit', (code) => {
  if (code !== 0) {
    console.error(`Backup failed (exit ${code}).`)
    process.exit(code ?? 1)
  }
  try {
    const size = statSync(outFile).size
    console.log(`Backup OK: ${path.relative(ROOT, outFile)} (${size} bytes)`)
    console.log('NOTE: backups contain patient data (PHI) — store them securely; never commit.')
  } catch {
    console.log('Backup finished.')
  }
})
