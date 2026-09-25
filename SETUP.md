# CHO Laboratory Appointment System - Setup Guide (MySQL 8.0)

The app runs as a Node.js service and talks to MySQL 8.0 (database name
`bcho_lab_appointment`) over a normal TCP connection from the server only.
Admin auth is password + opaque sessions stored in MySQL (scrypt hashes,
httpOnly cookies) — no external auth service.

## 1. Create the database and apply the schema

```bash
mysql -u root -p -e "CREATE DATABASE bcho_lab_appointment
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p bcho_lab_appointment < ./mysql/schema.sql
```

This creates `appointments`, `admin_users`, and `admin_sessions` (empty —
fresh start; see `mysql/schema.sql` for constraints, CHECK rules and indexes).
`blocked_dates` (days closed by an admin) is in the same file and the app also
creates it on first use.

Create an application user (do not run the app as `root`):

```sql
CREATE USER 'cho_app'@'10.%' IDENTIFIED BY 'a-strong-password';
-- ALTER/CREATE are only for the app's self-healing migrations
-- (new column on an old database, and the blocked_dates table)
GRANT SELECT, INSERT, UPDATE, DELETE, ALTER, CREATE
  ON bcho_lab_appointment.* TO 'cho_app'@'10.%';
FLUSH PRIVILEGES;
```

## 2. Connection variables

Set these server-only variables (`.env.local` locally, the service
environment in production) — copy from `.env.example`:

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=bcho_lab_appointment
MYSQL_USER=cho_app
MYSQL_PASSWORD=...

# Optional
# MYSQL_CONNECTION_LIMIT=10
# MYSQL_SSL=true
# MYSQL_SSL_CA=/absolute/path/to/ca.pem
# MYSQL_SSL_CERT=/absolute/path/to/client-cert.pem
# MYSQL_SSL_KEY=/absolute/path/to/client-key.pem
# MYSQL_SSL_REJECT_UNAUTHORIZED=true
```

Optional split-deployment variables (unchanged):

```env
# NEXT_PUBLIC_APP_MODE=admin            # staff deployment only
# NEXT_PUBLIC_PATIENT_SITE_URL=https://your-patient-site.example.com
```

## 3. Seed the first admin

```powershell
$env:MYSQL_HOST='127.0.0.1'
$env:MYSQL_PORT='3306'
$env:MYSQL_DATABASE='bcho_lab_appointment'
$env:MYSQL_USER='cho_app'
$env:MYSQL_PASSWORD='...'
$env:CHO_ADMIN_EMAIL='admin@cho.gov.ph'
$env:CHO_ADMIN_PASSWORD='a-strong-password-min-12-chars'
node scripts/seed-admin.mjs
```

Re-running for the same email resets its password **and revokes all
existing sessions** for that admin (stale cookies stop working).

## 4. Run & verify

```bash
npm run dev      # http://localhost:3000
npm run build    # must pass before pushing
```

Checks:

```bash
node scripts/check-database.mjs      # connectivity + schema/seed sanity
node security-tests/mysql-e2e.mjs    # boots a throwaway MySQL 8.0 and runs
                                     # the full booking/admin/auth suite
```

Log in at `/admin` with the seeded credentials.

## 5. Backups

The database holds patient data — take regular backups:

```bash
mysqldump -u cho_app -p --single-transaction --routines \
  bcho_lab_appointment > backups/bcho_lab_appointment-$(date +%F).sql
```

- `backups/` is gitignored (exports contain PHI — never commit them).
- Schedule it (weekly is a reasonable start) and copy exports to secure
  off-machine storage. Restore practice: load a dump into a *scratch*
  database first, never over production.
- Column additions are applied automatically by the app on first use
  (`src/lib/*-column.ts`); for a fresh database `mysql/schema.sql`
  already contains every column.

## Security notes

- The browser never talks to MySQL: booking goes through validated,
  rate-limited `POST /api/appointments` (server-generated UUID, daily
  per-test quota enforcement, admin-blocked dates, Turnstile — fails closed in
  production if `TURNSTILE_SECRET_KEY` is missing); admin reads/deletes go through
  session-gated `/api/appointments*` (opaque sessions with sliding
  refresh and a 30-day absolute cap, generic login errors + per-account
  lockout to block enumeration/brute force).
- `src/proxy.ts` is a second authorization layer: every `/api` path is
  denied unless explicitly public (login/logout/quotas/booking POST).
  Route handlers still run their own `requireAdmin` — keep both.
- QR codes encode the appointment UUID; scanning calls
  `POST /api/appointments/[id]/check-in`, which requires an admin
  session and enforces status, date and one-time use (`checked_in_at`).
- Bind MySQL to localhost / a private network and restrict the app user
  to the four DML statements above. Never commit `.env.local`; rotate
  the MySQL password if ever exposed. Git history in this repo once
  contained unrelated secrets (old Supabase key, a GitHub PAT) — they
  must be treated as leaked and rotated if that history was pushed.
