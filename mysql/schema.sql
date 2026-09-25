-- CHO Laboratory Appointment System — MySQL 8.0 schema
-- Converted from d1/schema.sql (Cloudflare D1 / SQLite).
-- Apply with: mysql -h <host> -P <port> -u <user> -p <database> < ./mysql/schema.sql
-- Fresh start: tables are created empty. Admins are seeded via scripts/seed-admin.mjs.
--
-- Conversion notes (SQLite -> MySQL):
--   * Indexes are declared inline in CREATE TABLE so the file stays idempotent.
--     MySQL has no "CREATE INDEX IF NOT EXISTS", so separate CREATE INDEX
--     statements would fail on re-run.
--   * Dates/timestamps that the app reads back stay as strings (VARCHAR) in the
--     exact ISO-8601 UTC format produced by new Date().toISOString()
--     (created_at, checked_in_at, appointment_date, birthdate). MySQL DATE /
--     DATETIME columns would come back as Date objects and change the JSON the
--     API returns, plus shift with the server timezone.
--   * SQLite's DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) cannot be
--     reproduced on a MySQL string column. Every appointments INSERT in the app
--     supplies created_at explicitly, so no default is needed there.
--   * CHECK constraints are enforced from MySQL 8.0.16 on. length() in SQLite
--     counts characters -> CHAR_LENGTH() in MySQL. VARCHAR(n) already caps
--     the maximum, the checks keep the minimum lengths.
--   * The d1/migrate_*.sql files are not needed: this schema already contains
--     every column those migrations add.
--   * Requires InnoDB (FK + ON DELETE CASCADE) and utf8mb4. Collation
--     utf8mb4_0900_ai_ci is the MySQL 8.0 default; use utf8mb4_unicode_ci on
--     older servers.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS appointments (
  id CHAR(36) NOT NULL,                       -- UUID from randomUUID()
  patient_name VARCHAR(100) NOT NULL CHECK (CHAR_LENGTH(patient_name) BETWEEN 2 AND 100),
  last_name VARCHAR(50) NOT NULL DEFAULT '' CHECK (CHAR_LENGTH(last_name) <= 50),
  first_name VARCHAR(50) NOT NULL DEFAULT '' CHECK (CHAR_LENGTH(first_name) <= 50),
  middle_name VARCHAR(50) NOT NULL DEFAULT '' CHECK (CHAR_LENGTH(middle_name) <= 50),
  birthdate VARCHAR(10) NOT NULL DEFAULT '',  -- YYYY-MM-DD
  age SMALLINT NOT NULL CHECK (age BETWEEN 1 AND 120),
  contact_number VARCHAR(20) NOT NULL DEFAULT '' CHECK (CHAR_LENGTH(contact_number) <= 20),
  consultation_facility VARCHAR(120) NOT NULL CHECK (CHAR_LENGTH(consultation_facility) BETWEEN 2 AND 120),
  yakap_registered TINYINT(1) NOT NULL DEFAULT 0 CHECK (yakap_registered IN (0, 1)),
  yakap_facility VARCHAR(120) NULL DEFAULT NULL,
  selected_tests TEXT NOT NULL,               -- JSON array of test labels
  appointment_date VARCHAR(10) NOT NULL,      -- YYYY-MM-DD
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled')),
  source VARCHAR(16) NOT NULL DEFAULT 'online' CHECK (source IN ('online','walkin')),
  checked_in_at VARCHAR(32) NULL DEFAULT NULL, -- ISO timestamp of first successful QR check-in scan (one-time use)
  created_at VARCHAR(32) NOT NULL,            -- ISO-8601 UTC, always set by the app
  PRIMARY KEY (id),
  KEY idx_appointments_patient_name (patient_name),
  KEY idx_appointments_last_name (last_name),
  KEY idx_appointments_first_name (first_name),
  KEY idx_appointments_consultation_facility (consultation_facility),
  KEY idx_appointments_appointment_date (appointment_date),
  KEY idx_appointments_status (status),
  KEY idx_appointments_created_at (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Admin credentials (passwords stored as scrypt hashes, never plaintext).
-- MySQL has no non-deterministic default for a string column, so created_at
-- uses a DATETIME default instead of SQLite's ISO string. The app never reads
-- this column. Run the connection with time_zone='+00:00' to store UTC.
CREATE TABLE IF NOT EXISTS admin_users (
  email VARCHAR(254) NOT NULL,                -- lowercase, max length enforced by the app
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Opaque session tokens (only SHA-256 hashes stored; raw token lives in the httpOnly cookie).
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash CHAR(64) NOT NULL,               -- SHA-256 hex
  email VARCHAR(254) NOT NULL,
  expires_at BIGINT NOT NULL,                 -- unix seconds
  created_at BIGINT NOT NULL,                 -- unix seconds
  PRIMARY KEY (token_hash),
  KEY idx_admin_sessions_email (email),
  KEY idx_admin_sessions_expires (expires_at),
  CONSTRAINT fk_admin_sessions_email FOREIGN KEY (email)
    REFERENCES admin_users (email) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dates the lab refuses for new bookings, managed from the admin dashboard.
-- Weekends and PH holidays are NOT stored here: those are static rules in
-- src/lib/dates/holidays.ts. Existing appointments on a blocked date are
-- never touched — the block only stops new online bookings and walk-ins.
-- The app creates this table on first use (src/lib/blocked-dates.ts), so
-- re-running schema.sql is only needed for a fresh database.
CREATE TABLE IF NOT EXISTS blocked_dates (
  blocked_date VARCHAR(10) NOT NULL,           -- YYYY-MM-DD, same format as appointment_date
  note VARCHAR(160) NOT NULL DEFAULT '',       -- optional reason shown to patients
  created_at VARCHAR(32) NOT NULL,             -- ISO-8601 UTC, set by the app
  created_by VARCHAR(254) NOT NULL DEFAULT '', -- admin who blocked it (audit)
  PRIMARY KEY (blocked_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
