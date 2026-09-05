/* Seed an admin user into D1 (fresh start).
 * Credentials and D1 coordinates come from environment only — never hardcode.
 *
 * Usage (PowerShell):
 *   $env:CLOUDFLARE_ACCOUNT_ID='...'; $env:CLOUDFLARE_D1_DATABASE_ID='...'
 *   $env:CLOUDFLARE_D1_API_TOKEN='...'; $env:CHO_ADMIN_EMAIL='admin@cho.gov.ph'
 *   $env:CHO_ADMIN_PASSWORD='...'; node scripts/seed-admin.mjs
 */
import { randomBytes, scryptSync } from 'node:crypto';

const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_D1_API_TOKEN } = process.env;
const email = (process.env.CHO_ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.CHO_ADMIN_PASSWORD || '';

if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_D1_DATABASE_ID || !CLOUDFLARE_D1_API_TOKEN) {
  console.error('Missing env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_D1_API_TOKEN.');
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 12) {
  console.error('Set CHO_ADMIN_EMAIL (valid email) and CHO_ADMIN_PASSWORD (min 12 chars).');
  process.exit(1);
}

function hashPassword(pw) {
  const salt = randomBytes(16).toString('base64');
  const hash = scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64');
  return `scrypt$v=1$n=16384$r=8$p=1$${salt}$${hash}`;
}

const endpoint = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${CLOUDFLARE_D1_DATABASE_ID}/query`;
const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${CLOUDFLARE_D1_API_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    sql: 'INSERT INTO admin_users (email, password_hash) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash',
    params: [email, hashPassword(password)],
  }),
});

const json = await res.json().catch(() => ({}));
if (!res.ok || json.success === false) {
  console.error('Seed failed:', JSON.stringify(json.errors || json).slice(0, 500));
  process.exit(1);
}
console.log(`Admin seeded: ${email}`);
