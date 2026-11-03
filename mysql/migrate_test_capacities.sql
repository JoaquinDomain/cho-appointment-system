-- Additive migration: admin-managed daily online capacity per laboratory test.
--
-- Safe to run on production:
--   * only CREATE TABLE IF NOT EXISTS and INSERT IGNORE are used
--   * appointments, admin_users, admin_sessions and blocked_dates are untouched
--   * existing test_capacities rows (including admin edits) are never changed
--   * no rows are deleted, truncated or reseeded
--
-- Recommended before applying:
--   mysqldump -h 127.0.0.1 -u <dbuser> -p bcho_lab_appointment \
--     appointments admin_users admin_sessions blocked_dates \
--     > bcho_lab_appointment_pre_capacity_backup.sql
--
-- Apply:
--   mysql -h 127.0.0.1 -u <dbuser> -p bcho_lab_appointment \
--     < ./mysql/migrate_test_capacities.sql
--
-- Verify:
--   SELECT test_label, max_online_capacity, updated_at, updated_by
--   FROM test_capacities ORDER BY test_label;

CREATE TABLE IF NOT EXISTS test_capacities (
  test_label VARCHAR(120) NOT NULL,
  max_online_capacity INT UNSIGNED NOT NULL,
  updated_at VARCHAR(32) NOT NULL,
  updated_by VARCHAR(254) NOT NULL DEFAULT '',
  PRIMARY KEY (test_label),
  CONSTRAINT chk_test_capacities_max
    CHECK (max_online_capacity BETWEEN 0 AND 100000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Preserve the previous online share until an admin changes each test:
-- half of the daily limit, or the full limit for online-only ECG.
INSERT IGNORE INTO test_capacities
  (test_label, max_online_capacity, updated_at, updated_by)
VALUES
  ('CBC', 50, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Chest X-Ray', 50, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Glucose (FBS)', 25, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('OGTT', 1, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Lipid Profile', 25, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Creatinine (CREA)', 25, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Uric Acid (URIC)', 25, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('BUN', 25, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Urinalysis', 50, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Stool Exam (S/E)', 15, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('HBsAg', 25, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Syphilis', 25, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('HIV Test', 25, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Pregnancy Test', 25, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Gram Staining', 25, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Pap Smear', 5, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('ECG', 15, '2026-01-01T00:00:00.000Z', 'migration-seed');

-- Rollback (only after restoring the previous application release; the old
-- release ignores this table, so leaving it in place is also safe):
--   DROP TABLE IF EXISTS test_capacities;
