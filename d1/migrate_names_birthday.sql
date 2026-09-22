-- Split patient_name into last/first/middle + birthdate (birthday replaces manual age).
-- Fresh databases get these from d1/schema.sql; existing ones apply this:
--   npx wrangler d1 execute cho-appointments --remote --file=./d1/migrate_names_birthday.sql
-- Existing rows keep patient_name and age; new columns default to '' and are
-- filled going forward. Staff can update old rows via the admin edit form.
ALTER TABLE appointments ADD COLUMN last_name TEXT NOT NULL DEFAULT '' CHECK (length(last_name) <= 50);
ALTER TABLE appointments ADD COLUMN first_name TEXT NOT NULL DEFAULT '' CHECK (length(first_name) <= 50);
ALTER TABLE appointments ADD COLUMN middle_name TEXT NOT NULL DEFAULT '' CHECK (length(middle_name) <= 50);
ALTER TABLE appointments ADD COLUMN birthdate TEXT NOT NULL DEFAULT '';
