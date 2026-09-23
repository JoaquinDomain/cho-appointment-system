-- QR one-time check-in: timestamp of first successful scan.
-- Apply with:
--   npx wrangler d1 execute cho-appointments --remote --file=./d1/migrate_checked_in.sql
-- (the app also auto-applies this on first scan against an old database)

ALTER TABLE appointments ADD COLUMN checked_in_at TEXT;
