-- Track booking origin so quotas can split online vs walk-in counts.
-- Fresh databases get it from d1/schema.sql; existing ones apply this:
--   npx wrangler d1 execute cho-appointments --remote --file=./d1/migrate_source.sql
-- Rows written before this migration are online bookings (walk-ins didn't exist yet).
ALTER TABLE appointments ADD COLUMN source TEXT NOT NULL DEFAULT 'online' CHECK (source IN ('online','walkin'));
