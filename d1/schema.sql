-- CHO Laboratory Appointment System — Cloudflare D1 schema (SQLite)
-- Apply with: npx wrangler d1 execute cho-appointments --remote --file=./d1/schema.sql
-- Fresh start: tables are created empty. Admins are seeded via scripts/seed-admin.mjs.
-- Existing databases (created before the status workflow): CREATE TABLE IF NOT
-- EXISTS will NOT add new columns, so also apply:
--   npx wrangler d1 execute cho-appointments --remote --file=./d1/migrate_status.sql

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  patient_name TEXT NOT NULL CHECK (length(patient_name) BETWEEN 2 AND 100),
  age INTEGER NOT NULL CHECK (age BETWEEN 1 AND 120),
  contact_number TEXT NOT NULL DEFAULT '' CHECK (length(contact_number) <= 20),
  consultation_facility TEXT NOT NULL CHECK (length(consultation_facility) BETWEEN 2 AND 120),
  yakap_registered INTEGER NOT NULL DEFAULT 0 CHECK (yakap_registered IN (0, 1)),
  yakap_facility TEXT,
  selected_tests TEXT NOT NULL, -- JSON array of test labels
  appointment_date TEXT NOT NULL, -- YYYY-MM-DD
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled')),
  source TEXT NOT NULL DEFAULT 'online' CHECK (source IN ('online','walkin')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_appointments_patient_name ON appointments(patient_name);
CREATE INDEX IF NOT EXISTS idx_appointments_consultation_facility ON appointments(consultation_facility);
CREATE INDEX IF NOT EXISTS idx_appointments_appointment_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_created_at ON appointments(created_at DESC);

-- Admin credentials (passwords stored as scrypt hashes, never plaintext).
CREATE TABLE IF NOT EXISTS admin_users (
  email TEXT PRIMARY KEY, -- lowercase
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Opaque session tokens (only SHA-256 hashes stored; raw token lives in the httpOnly cookie).
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL, -- unix seconds
  created_at INTEGER NOT NULL, -- unix seconds
  FOREIGN KEY (email) REFERENCES admin_users(email) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_email ON admin_sessions(email);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);
