/* Local dev database: boots a throwaway MySQL 8.0 (mysql-memory-server),
 * applies ./mysql/schema.sql, seeds an admin, and writes MYSQL_* into
 * .env.local. Keeps running until Ctrl+C — data dies with this process.
 *
 *   CHO_ADMIN_EMAIL=... CHO_ADMIN_PASSWORD=... node scripts/dev-db.mjs
 * (password is generated and printed when CHO_ADMIN_PASSWORD is unset)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { createDB } from 'mysql-memory-server';
import mysql from 'mysql2/promise';

const DB_NAME = 'bcho_lab_appointment';
const PORT = 3306;

const db = await createDB({
  version: '8.0.x',
  dbName: DB_NAME,
  port: PORT,
  xEnabled: 'OFF',
  logLevel: 'ERROR',
});
console.log(`MySQL up on 127.0.0.1:${db.port} (user ${db.username}, db ${db.dbName})`);

const conn = await mysql.createConnection({
  host: '127.0.0.1',
  port: db.port,
  user: db.username,
  password: '',
  database: db.dbName,
  dateStrings: true,
  multipleStatements: true,
});
await conn.query(readFileSync(resolve(process.cwd(), 'mysql/schema.sql'), 'utf8'));

function hashPassword(pw) {
  const salt = randomBytes(16).toString('base64');
  const hash = scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64');
  return `scrypt$v=1$n=16384$r=8$p=1$${salt}$${hash}`;
}

const email = (process.env.CHO_ADMIN_EMAIL || 'admin@cho.gov.ph').trim().toLowerCase();
const generated = !process.env.CHO_ADMIN_PASSWORD;
const password = process.env.CHO_ADMIN_PASSWORD || randomBytes(12).toString('base64');
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 12) {
  console.error('CHO_ADMIN_EMAIL must be a valid email and CHO_ADMIN_PASSWORD at least 12 chars.');
  await db.stop();
  process.exit(1);
}
await conn.execute('INSERT INTO admin_users (email, password_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE password_hash = ?', [
  email,
  hashPassword(password),
  hashPassword(password),
]);
console.log(`Admin ready: ${email} / ${password}${generated ? '  (generated)' : ''}`);

const envPath = resolve(process.cwd(), '.env.local');
const wanted = {
  MYSQL_HOST: '127.0.0.1',
  MYSQL_PORT: String(db.port),
  MYSQL_DATABASE: db.dbName,
  MYSQL_USER: db.username,
  MYSQL_PASSWORD: '',
};
let envText = '';
try {
  envText = readFileSync(envPath, 'utf8');
} catch {
  // no .env.local yet
}
const lines = envText.split(/\r?\n/);
const missing = Object.keys(wanted).filter((k) => !lines.some((l) => l.trimStart().startsWith(`${k}=`)));
for (const [key, value] of Object.entries(wanted)) {
  const pattern = new RegExp(`^${key}=.*$`);
  if (lines.some((l) => pattern.test(l))) {
    const i = lines.findIndex((l) => pattern.test(l));
    lines[i] = `${key}=${value}`;
  } else {
    lines.push(`${key}=${value}`);
  }
}
writeFileSync(envPath, lines.join('\n').replace(/\n{3,}$/, '\n'));
console.log(`.env.local updated (${missing.length === 0 ? 'existing MYSQL_* keys' : `added ${missing.join(', ')}`})`);
console.log('Ready. In another terminal: npm run dev  →  http://localhost:3000/admin');

const shutdown = async () => {
  console.log('\nStopping MySQL...');
  try {
    await conn.end();
    await db.stop();
  } finally {
    process.exit(0);
  }
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 1 << 30);
