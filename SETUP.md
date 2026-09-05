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

Re-running for the same email resets its password.

## 4. Run & deploy

```bash
npm run dev      # http://localhost:3000
npm run build    # must pass before pushing
```

Push to `main` — Vercel auto-deploys (two projects if using split mode).
Log in at `/admin` on the staff deployment with the seeded credentials.

## Security notes

- The browser never talks to D1: booking goes through validated,
  rate-limited `POST /api/appointments` (server-generated UUID, daily
  per-test quota enforcement); admin reads/deletes go through session-gated
  `/api/appointments*` (7-day opaque sessions, sliding refresh, generic
  login errors to block enumeration).
- Never commit `.env.local`; rotate the D1 token if ever exposed
  (Cloudflare dashboard > API Tokens).
