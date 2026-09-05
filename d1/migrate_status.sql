-- Add status workflow to existing D1 databases (safe to re-run).
-- Apply with: npx wrangler d1 execute cho-appointments --remote --file=./d1/migrate_status.sql
ALTER TABLE appointments ADD COLUMN status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled'));
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
