# CHO Laboratory Appointment System - Setup Guide (Secured)

## Environment Variables

Copy `.env.example` to `.env.local` and fill in (never commit `.env.local`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_EMAILS=admin@cho.gov.ph
# NEXT_PUBLIC_APP_MODE=admin            # staff deployment only
# NEXT_PUBLIC_PATIENT_SITE_URL=https://your-patient-site.vercel.app
```

On Vercel, set the same variables (plus `NEXT_PUBLIC_APP_MODE=admin` on the
staff project and the patient URL). `SUPABASE_SERVICE_ROLE_KEY` is server-only.

## Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Navigate to the SQL Editor in your Supabase dashboard
3. Run the hardened `supabase-setup.sql` (idempotent; preserves data). It adds
   CHECK constraints, the `admin_allowlist` table, `is_admin()`, indexes, and
   admin-only SELECT/UPDATE/DELETE policies.
4. Register each admin (Auth > Users must also exist for login):
   ```sql
   INSERT INTO admin_allowlist (email) VALUES ('admin@cho.gov.ph')
   ON CONFLICT (email) DO NOTHING;
   ```
   Alternatively, set `ADMIN_EMAILS` and skip the table.
5. Copy project URL + anon key (Settings > API) and the service-role key
   (keep secret) into `.env.local` / Vercel.
6. Disable public sign-ups or restrict to admin creation (Auth > Settings),
   and **revoke any previously leaked keys** (Supabase Settings > API >
   Rotate keys; GitHub Settings > Tokens for the old helper script token).

## Database Schema

`appointments` with hardened constraints:
- `patient_name` 2–100 chars, `age` 1–120
- `consultation_facility` + `yakap_facility` from facility allowlist
- `yakap_facility` required iff `yakap_registered = true`
- `selected_tests[1..17]` from lab-test allowlist
- `appointment_date` today .. today+180 (server + DB enforced)

## Authentication & Data Access

- Public booking goes through `POST /api/appointments` (validated with
  `lib/validation.ts`, rate-limited, server-generated UUID via service_role).
- Admin reads/deletes go through `/api/appointments*` which requires a
  Supabase session **and** allowlist membership (`ADMIN_EMAILS` or
  `admin_allowlist`). RLS independently denies non-admin SELECT/DELETE/UPDATE
  on direct DB access.
- Session cookies are refreshed in `src/proxy.ts`.

## Deployment

1. Push your code to GitHub (verify `git status` shows no `.env.local`)
2. Connect your repository to Vercel (two projects if using split mode)
3. Add environment variables in Vercel project settings
4. Deploy automatically on push to main branch
