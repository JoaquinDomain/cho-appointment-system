-- Additive migration: admin-managed daily online + walk-in capacity per test.
--
-- Safe to run on production:
--   * only CREATE TABLE IF NOT EXISTS, INSERT IGNORE and one guarded ALTER TABLE
--     are used; the ALTER only runs when max_walkin_capacity is missing
--   * appointments, admin_users, admin_sessions and blocked_dates are untouched
--   * existing test_capacities rows (including admin edits) are never changed
--     on a re-run; the walk-in defaults are only seeded the first time the
--     column is added
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
--   SELECT test_label, max_online_capacity, max_walkin_capacity, updated_at,
--          updated_by
--   FROM test_capacities ORDER BY test_label;

CREATE TABLE IF NOT EXISTS test_capacities (
  test_label VARCHAR(120) NOT NULL,
  max_online_capacity INT UNSIGNED NOT NULL,
  max_walkin_capacity INT UNSIGNED NOT NULL,
  updated_at VARCHAR(32) NOT NULL,
  updated_by VARCHAR(254) NOT NULL DEFAULT '',
  PRIMARY KEY (test_label),
  CONSTRAINT chk_test_capacities_max
    CHECK (max_online_capacity BETWEEN 0 AND 100000),
  CONSTRAINT chk_test_capacities_walkin
    CHECK (max_walkin_capacity BETWEEN 0 AND 100000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Older installations already have test_capacities without the walk-in column.
-- MySQL has no ADD COLUMN IF NOT EXISTS, so check information_schema first.
SET @had_walkin_column := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'test_capacities'
    AND column_name = 'max_walkin_capacity'
);

SET @ddl := IF(
  @had_walkin_column = 0,
  'ALTER TABLE test_capacities ADD COLUMN max_walkin_capacity INT UNSIGNED NOT NULL DEFAULT 0 AFTER max_online_capacity',
  'DO 0'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Seed the previous walk-in share only for rows that predate the column.
-- Re-running this migration must never reset an admin's saved values.
SET @seed_defaults := IF(
  @had_walkin_column = 0,
  'UPDATE test_capacities SET max_walkin_capacity = CASE test_label
     WHEN ''CBC'' THEN 50
     WHEN ''Chest X-Ray'' THEN 50
     WHEN ''Glucose (FBS)'' THEN 25
     WHEN ''OGTT'' THEN 0
     WHEN ''Lipid Profile'' THEN 25
     WHEN ''Creatinine (CREA)'' THEN 25
     WHEN ''Uric Acid (URIC)'' THEN 25
     WHEN ''BUN'' THEN 25
     WHEN ''Urinalysis'' THEN 50
     WHEN ''Stool Exam (S/E)'' THEN 15
     WHEN ''HBsAg'' THEN 25
     WHEN ''Syphilis'' THEN 25
     WHEN ''HIV Test'' THEN 25
     WHEN ''Pregnancy Test'' THEN 25
     WHEN ''Gram Staining'' THEN 25
     WHEN ''Pap Smear'' THEN 5
     WHEN ''ECG'' THEN 0
     ELSE 0
   END',
  'DO 0'
);
PREPARE stmt FROM @seed_defaults;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add any missing tests. Existing rows are left exactly as the admin saved
-- them. The defaults preserve the old online/walk-in split (half and half,
-- online-only ECG keeps the full online limit and zero walk-in slots).
INSERT IGNORE INTO test_capacities
  (test_label, max_online_capacity, max_walkin_capacity, updated_at, updated_by)
VALUES
  ('CBC', 50, 50, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Chest X-Ray', 50, 50, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Glucose (FBS)', 25, 25, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('OGTT', 1, 0, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Lipid Profile', 25, 25, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Creatinine (CREA)', 25, 25, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Uric Acid (URIC)', 25, 25, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('BUN', 25, 25, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Urinalysis', 50, 50, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Stool Exam (S/E)', 15, 15, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('HBsAg', 25, 25, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Syphilis', 25, 25, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('HIV Test', 25, 25, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Pregnancy Test', 25, 25, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Gram Staining', 25, 25, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('Pap Smear', 5, 5, '2026-01-01T00:00:00.000Z', 'migration-seed'),
  ('ECG', 15, 0, '2026-01-01T00:00:00.000Z', 'migration-seed');

-- Rollback (only after restoring the previous application release; the old
-- release ignores this table, so leaving it in place is also safe):
--   DROP TABLE IF EXISTS test_capacities;
