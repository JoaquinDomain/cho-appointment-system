# CHO Laboratory Appointment System - Setup Guide (Cloudflare D1)

The app runs on Vercel; all data lives in Cloudflare D1 (SQLite), reached
server-side over the D1 HTTP API. Admin auth is password + opaque sessions
stored in D1 (scrypt hashes, httpOnly cookies) — no external auth service.

## 1. Create the D1 database

```bash
npx wrangler login
npx wrangler d1 create cho-appointments
```

Copy the `database_id` into `wrangler.toml`, then apply the schema:

```bash
npx wrangler d1 execute cho-appointments --remote --file=./d1/schema.sql
```

This creates `appointments`, `admin_users`, and `admin_sessions` (empty —
fresh start; see `d1/schema.sql` for constraints and indexes).

## 2. API token

Create a Cloudflare API token (My Profile > API Tokens) with **D1 Edit**
permission for this database, then set these server-only variables
(`.env.local` locally, Vercel project settings in production):

```env
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id
CLOUDFLARE_D1_DATABASE_ID=your-d1-database-id
CLOUDFLARE_D1_API_TOKEN=your-d1-api-token
```

Optional split-deployment variables (unchanged):

```env
# NEXT_PUBLIC_APP_MODE=admin            # staff deployment only
# NEXT_PUBLIC_PATIENT_SITE_URL=https://your-patient-site.vercel.app
```

## 3. Seed the first admin

```powershell
$env:CLOUDFLARE_ACCOUNT_ID='...'
$env:CLOUDFLARE_D1_DATABASE_ID='...'
$env:CLOUDFLARE_D1_API_TOKEN='...'
$env:CHO_ADMIN_EMAIL='admin@cho.gov.ph'
$env:CHO_ADMIN_PASSWORD='a-strong-password-min-12-chars'
node scripts/seed-admin.mjs
```

Re-running for the same email resets its password **and revokes all
existing sessions** for that admin (stale cookies stop working).

## 4. Run & deploy

```bash
npm run dev      # http://localhost:3000
npm run build    # must pass before pushing
```

Push to `main` — Vercel auto-deploys (two projects if using split mode).
Log in at `/admin` on the staff deployment with the seeded credentials.

## 5. Backups

The database holds patient data — take regular backups:

```bash
npm run backup:d1     # writes backups/cho-appointments-<timestamp>.sql
```

- `backups/` is gitignored (exports contain PHI — never commit them).
- Schedule it (weekly is a reasonable start) and copy exports to secure
  off-machine storage. Restore practice: load a dump into a *scratch* D1
  database first, never over production.
- Existing databases created before a schema change need the matching
  `d1/migrate_*.sql` (the app also auto-applies column migrations on use).

## Security notes

- The browser never talks to D1: booking goes through validated,
  rate-limited `POST /api/appointments` (server-generated UUID, daily
  per-test quota enforcement, Turnstile — fails closed in production if
  `TURNSTILE_SECRET_KEY` is missing); admin reads/deletes go through
  session-gated `/api/appointments*` (opaque sessions with sliding
  refresh and a 30-day absolute cap, generic login errors + per-account
  lockout to block enumeration/brute force).
- `src/proxy.ts` is a second authorization layer: every `/api` path is
  denied unless explicitly public (login/logout/quotas/booking POST).
  Route handlers still run their own `requireAdmin` — keep both.
- QR codes encode the appointment UUID; scanning calls
  `POST /api/appointments/[id]/check-in`, which requires an admin
  session and enforces status, date and one-time use (`checked_in_at`).
- Never commit `.env.local`; rotate the D1 token if ever exposed
  (Cloudflare dashboard > API Tokens). Git history in this repo once
  contained unrelated secrets (old Supabase key, a GitHub PAT) — they
  must be treated as leaked and rotated if that history was pushed.
