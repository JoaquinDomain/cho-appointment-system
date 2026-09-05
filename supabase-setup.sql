-- CHO Laboratory Appointment System — Hardened Supabase Setup
-- Run this in Supabase SQL Editor (idempotent; safe to re-run, preserves data).
-- Pairs with server API (service_role) + ADMIN_EMAILS / admin_allowlist.
--
-- Security model:
--  * INSERT stays publicly reachable so booking works, but table-level CHECK
--    constraints reject out-of-range / malformed rows even on direct calls.
--    Preferred path is POST /api/appointments (validated + rate-limited,
--    writes with service_role which bypasses RLS).
--  * SELECT / UPDATE / DELETE are admin-only via public.is_admin(), which
--    checks the admin_allowlist table against auth.jwt()->>'email'.
--    There is intentionally NO permissive authenticated-SELECT policy.
--  * admin_allowlist has NO public policies: only service_role (bypasses RLS)
--    and the SECURITY DEFINER is_admin() function can read it.

-- 1) Table (create if missing)
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name text NOT NULL,
  age integer NOT NULL,
  consultation_facility text NOT NULL,
  yakap_registered boolean DEFAULT false NOT NULL,
  yakap_facility text,
  selected_tests text[] NOT NULL,
  appointment_date date NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2) Hardening CHECK constraints (added only if missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_patient_name_len') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_patient_name_len
      CHECK (char_length(patient_name) BETWEEN 2 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_age_range') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_age_range
      CHECK (age BETWEEN 1 AND 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_facility_len') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_facility_len
      CHECK (char_length(consultation_facility) BETWEEN 2 AND 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_tests_count') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_tests_count
      CHECK (selected_tests IS NOT NULL AND array_length(selected_tests, 1) BETWEEN 1 AND 17);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_date_window') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_date_window
      CHECK (appointment_date >= CURRENT_DATE AND appointment_date <= CURRENT_DATE + 180);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_yakap_consistency') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_yakap_consistency
      CHECK (
        (yakap_registered = false)
        OR (yakap_registered = true AND yakap_facility IS NOT NULL AND char_length(yakap_facility) BETWEEN 2 AND 120)
      );
  END IF;
END $$;

-- 3) Indexes
CREATE INDEX IF NOT EXISTS idx_appointments_patient_name ON appointments(patient_name);
CREATE INDEX IF NOT EXISTS idx_appointments_consultation_facility ON appointments(consultation_facility);
CREATE INDEX IF NOT EXISTS idx_appointments_appointment_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_created_at ON appointments(created_at DESC);

-- 4) Admin allowlist (source of truth for is_admin())
CREATE TABLE IF NOT EXISTS admin_allowlist (
  email citext PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
-- Enable RLS with NO public policies => direct anon/authenticated reads denied.
ALTER TABLE admin_allowlist ENABLE ROW LEVEL SECURITY;

-- Seed example (replace with real admin; safe to re-run):
-- INSERT INTO admin_allowlist (email) VALUES ('admin@cho.gov.ph')
-- ON CONFLICT (email) DO NOTHING;

-- 5) is_admin() helper — SECURITY DEFINER so it can read the locked allowlist
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_allowlist
    WHERE email = NULLIF((auth.jwt() ->> 'email'), '')
  );
$$;

-- 6) RLS on appointments
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Drop legacy permissive / inconsistent policies from earlier versions
DROP POLICY IF EXISTS "Allow public inserts" ON appointments;
DROP POLICY IF EXISTS "Allow public insert" ON appointments;
DROP POLICY IF EXISTS "Allow authenticated admin read" ON appointments;
DROP POLICY IF EXISTS "Allow authenticated select" ON appointments;
DROP POLICY IF EXISTS "Allow authenticated update" ON appointments;
DROP POLICY IF EXISTS "Allow authenticated delete" ON appointments;
DROP POLICY IF EXISTS "Public can insert valid appointments" ON appointments;
DROP POLICY IF EXISTS "Admins can read appointments" ON appointments;
DROP POLICY IF EXISTS "Admins can delete appointments" ON appointments;
DROP POLICY IF EXISTS "Admins can update appointments" ON appointments;

-- Public booking inserts allowed; CHECK constraints + API validation enforce shape.
-- Service_role (used by /api) bypasses RLS entirely.
CREATE POLICY "Public can insert valid appointments"
  ON appointments FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Admin-only reads/deletes/updates. Any authenticated user NOT in the
-- allowlist gets zero rows and cannot delete/update.
CREATE POLICY "Admins can read appointments"
  ON appointments FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete appointments"
  ON appointments FOR DELETE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can update appointments"
  ON appointments FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
