/* Seed an admin user into MySQL (fresh start).
 * Credentials and MySQL coordinates come from environment only — never hardcode.
 *
 * Usage (PowerShell):
 *   $env:MYSQL_HOST='127.0.0.1'; $env:MYSQL_DATABASE='bcho_lab_appointment'
 *   $env:MYSQL_USER='cho_app'; $env:MYSQL_PASSWORD='...'
 *   $env:CHO_ADMIN_EMAIL='admin@cho.gov.ph'; $env:CHO_ADMIN_PASSWORD='...'
 *   node scripts/seed-admin.mjs
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { createPool, loadEnv } from './db-env.mjs';

const env = loadEnv();
const email = (env.CHO_ADMIN_EMAIL || '').trim().toLowerCase();
const password = env.CHO_ADMIN_PASSWORD || '';

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 12) {
  console.error('Set CHO_ADMIN_EMAIL (valid email) and CHO_ADMIN_PASSWORD (min 12 chars).');
  process.exit(1);
}

function hashPassword(pw) {
  const salt = randomBytes(16).toString('base64');
  const hash = scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64');
  return `scrypt$v=1$n=16384$r=8$p=1$${salt}$${hash}`;
}

const pool = createPool(env);
try {
  const hash = hashPassword(password);
  await pool.execute(
    'INSERT INTO admin_users (email, password_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE password_hash = ?',
    [email, hash, hash]
  );

  // Password changed/seeded — revoke every live session for this admin so a
  // stolen or stale cookie cannot keep working after a credential reset.
  try {
    const [result] = await pool.execute('DELETE FROM admin_sessions WHERE email = ?', [email]);
    console.log(`Existing sessions for this admin revoked (${result.affectedRows}).`);
  } catch {
    console.warn('Warning: could not revoke existing sessions for this admin.');
  }
  console.log(`Admin seeded: ${email}`);
} catch (e) {
  console.error('Seed failed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
