-- DEPRECATED: supabase-setup.sql is now idempotent and is the single source of
-- truth (it adds missing CHECK constraints, the admin_allowlist table,
-- is_admin(), indexes, and hardened RLS policies without dropping data).
-- Run supabase-setup.sql instead of this file.
--
-- Kept for history: legacy one-off renames (full_name -> patient_name, etc.)
-- are no-ops on up-to-date databases. Guarded so re-runs do not fail.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'full_name'
  ) THEN
    ALTER TABLE appointments RENAME COLUMN full_name TO patient_name;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'health_facility'
  ) THEN
    ALTER TABLE appointments RENAME COLUMN health_facility TO consultation_facility;
  END IF;
END $$;
-- Then run supabase-setup.sql to apply constraints + hardened policies.
SELECT 'Legacy rename step done. Now run supabase-setup.sql.' AS next_step;
