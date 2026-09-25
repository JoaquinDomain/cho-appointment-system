# Conversation log — D1/SQLite schema → MySQL conversion

Date: 2026-09-25

## Request

> Convert D1/SQLite schema → MySQL

## Context found in repo

- Source schema: `d1/schema.sql` (Cloudflare D1 / SQLite)
- Legacy column migrations: `d1/migrate_status.sql`, `migrate_checked_in.sql`,
  `migrate_source.sql`, `migrate_names_birthday.sql`, `migrate_contact.sql`
- DB access layer: `src/lib/db/d1.ts` (calls the Cloudflare D1 REST API directly)
- App writes `created_at` itself via `new Date().toISOString()`
  (`src/app/api/appointments/route.ts:151`, `src/app/api/admin/walkins/route.ts:112`)
- Appointment IDs are `randomUUID()` (36 chars)
- Session table stores unix seconds; token is SHA-256 hex (64 chars)

## Output

Created **`mysql/schema.sql`** with three tables: `appointments`, `admin_users`,
`admin_sessions`.

## Conversion decisions

| SQLite / D1 | MySQL 8.0 | Why |
|---|---|---|
| `id TEXT` (UUID) | `CHAR(36)` | fixed-length UUID |
| name/facility/status/source `TEXT` + `length()` checks | `VARCHAR(n)` + `CHAR_LENGTH()` checks | `length()` in SQLite counts characters |
| `age INTEGER` (1–120) | `SMALLINT` + CHECK | |
| `yakap_registered INTEGER 0/1` | `TINYINT(1)` + CHECK | app compares `=== 1` |
| `selected_tests TEXT` (JSON string) | `TEXT` | app does `JSON.parse(row.selected_tests)`; MySQL `JSON` type would return an object |
| `appointment_date`, `birthdate`, `created_at`, `checked_in_at` | `VARCHAR(10)` / `VARCHAR(32)` | app writes/reads ISO strings; MySQL `DATE`/`DATETIME` would come back as `Date` objects, shift with server timezone, and break `formatDateTime` / `typeof === 'string'` checks |
| `DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))` on `appointments.created_at` | no default, `NOT NULL` | MySQL can't default a string column to a non-deterministic expression; every app INSERT supplies `created_at` |
| `admin_users.created_at` (inserted without a value by `scripts/seed-admin.mjs`) | `DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)` | needs a real default; column is never read by the app |
| sessions `expires_at`/`created_at` unix seconds | `BIGINT` | SQLite `INTEGER` is 64-bit |
| `token_hash TEXT` | `CHAR(64)` | SHA-256 hex |
| `email TEXT` PK | `VARCHAR(254)` PK | app slices email to 254 chars |
| separate `CREATE INDEX IF NOT EXISTS ...` | inline `KEY ...` inside `CREATE TABLE` | MySQL has no `CREATE INDEX IF NOT EXISTS`; inline keys keep the file re-runnable |
| `FOREIGN KEY ... ON DELETE CASCADE` | same, inline + `ENGINE=InnoDB` | |
| (charset unspecified) | `utf8mb4` / `utf8mb4_0900_ai_ci` | MySQL 8.0 default; use `utf8mb4_unicode_ci` on older servers |
| `created_at DESC` index | `KEY ... (created_at DESC)` | descending indexes supported in 8.0 |

Other notes:

- `d1/migrate_*.sql` were **not** ported — `mysql/schema.sql` already contains every
  column those migrations add (they only exist for pre-existing D1 databases).
- CHECK constraints need MySQL **≥ 8.0.16**.
- For consistent UTC in `admin_users.created_at`, run the connection with
  `time_zone='+00:00'`.

## Follow-ups not yet done

1. `scripts/seed-admin.mjs:38` uses SQLite upsert syntax — for MySQL rewrite as:
   `INSERT INTO admin_users (email, password_hash) VALUES (?, ?)
    ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`
2. `src/lib/db/d1.ts` (Cloudflare D1 REST client) would need a MySQL driver
   replacement (e.g. `mysql2/promise`) before the app can use this schema.
3. SQLite-isms in app SQL that may need review on MySQL:
   - `LIKE ? ESCAPE '\\'` (`src/app/api/appointments/route.ts:289`) — MySQL default
     escape is `\`, so this works but is redundant.
   - Boolean/JSON columns intentionally kept as strings/ints (see table above).
4. Not verified against a live MySQL server — no `mysql`/`docker` binary was
   available in this environment.
