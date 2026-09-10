-- Contact number for patient follow-ups / reminders.
-- Fresh databases get it from d1/schema.sql; existing ones apply this:
--   npx wrangler d1 execute cho-appointments --remote --file=./d1/migrate_contact.sql
-- Existing rows keep '' (unknown) — staff can fill it in via the admin edit form.
ALTER TABLE appointments ADD COLUMN contact_number TEXT NOT NULL DEFAULT '' CHECK (length(contact_number) <= 20);
