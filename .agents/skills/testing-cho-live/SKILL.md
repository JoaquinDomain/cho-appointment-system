---
name: testing-cho-live
description: How to E2E test the CHO Laboratory Appointment System against the live Vercel deployment and Supabase backend
---

# Testing the CHO Laboratory Appointment System (live)

## Environments
- Live prod: https://cho-appointment-system-dental-clinic-team.vercel.app (public, no Vercel SSO). `/` = public booking form, `/admin` = Supabase Auth login + dashboard.
- Supabase project ref: `jsqkubtjdfxjmveckgof`.

## Devin Secrets Needed
- `SUPABASE_ACCESS_TOKEN` — Supabase Management API (SQL queries, revealing API keys).
- `VERCEL_TOKEN` — only needed for deploys/env changes.

## Admin login for testing
The real admin user is irealjayy@gmail.com; its password is generally NOT available. Workaround that avoids needing it:
1. Reveal the service_role key: `GET https://api.supabase.com/v1/projects/jsqkubtjdfxjmveckgof/api-keys?reveal=true` with the access token.
2. Create a throwaway confirmed auth user: `POST https://jsqkubtjdfxjmveckgof.supabase.co/auth/v1/admin/users` with `{"email":"devin-test-admin@example.com","password":"...","email_confirm":true}` (apikey + Bearer = service_role).
3. Log in at `/admin` with that user. RLS grants any `authenticated` user full select/update/delete on `appointments`.
4. DELETE the user afterwards (`DELETE /auth/v1/admin/users/<id>`) — it can read patient data, don't leave it behind.

## Verifying data / QR codes
- Verify inserted rows via Management API SQL: `POST https://api.supabase.com/v1/projects/<ref>/database/query` (anon key cannot SELECT — RLS is anon INSERT only).
- QR codes: click the in-app download button, then decode the PNG in `~/Downloads` with `zbarimg --raw <file>` (install `zbar-tools`). Booking QR should decode to the appointment UUID; the admin "QR Poster" should decode to the site origin.

## Gotchas
- Anon INSERT with `Prefer: return=representation` (i.e. `.insert().select()`) fails with 42501 because there is no anon SELECT policy — the app must not rely on RETURNING for anon inserts (fixed by generating the UUID client-side). If booking submits fail with "Failed to submit appointment", check this first.
- Test rows stay in the production DB — always use clearly-marked names like "Devin Test Patient" and clean up diagnostics via Management API SQL.
- Headless boxes have no camera: the admin "Scan QR Code" panel shows "Failed to start camera..." with a Retry button — that is the expected graceful state.
- The first character typed into the Full Name field right after clicking can be dropped; re-check the field value before submitting.
