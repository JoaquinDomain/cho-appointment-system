-- CHO Laboratory Appointment System - Supabase Setup Script

-- Create appointments table
CREATE TABLE appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  age INTEGER NOT NULL,
  health_facility TEXT NOT NULL,
  yakap_registered TEXT NOT NULL, -- 'YES' or 'NO'
  yakap_facility TEXT, -- Only required if yakap_registered = 'YES'
  selected_tests TEXT[] NOT NULL, -- Array of selected tests
  appointment_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  qr_code_id TEXT UNIQUE DEFAULT gen_random_uuid()::TEXT
);

-- Create index for faster searches
CREATE INDEX idx_appointments_full_name ON appointments(full_name);
CREATE INDEX idx_appointments_health_facility ON appointments(health_facility);
CREATE INDEX idx_appointments_appointment_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_qr_code_id ON appointments(qr_code_id);

-- Enable Row Level Security
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public users to insert appointments
CREATE POLICY "Allow public insert" ON appointments
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Policy: Allow authenticated users to select all appointments
CREATE POLICY "Allow authenticated select" ON appointments
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to update appointments
CREATE POLICY "Allow authenticated update" ON appointments
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy: Allow authenticated users to delete appointments
CREATE POLICY "Allow authenticated delete" ON appointments
  FOR DELETE
  TO authenticated
  USING (true);

-- Create a function to check if user is admin (optional - for more granular control)
-- This assumes you'll have an admin_users table or similar
-- For now, we'll use simple authenticated check

-- Optional: Create admin users table for more granular control
-- CREATE TABLE admin_users (
--   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
--   email TEXT UNIQUE NOT NULL,
--   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );

-- Optional: Create a more restrictive policy for admin-only access
-- CREATE POLICY "Allow admin select only" ON appointments
--   FOR SELECT
--   TO authenticated
--   USING (
--     EXISTS (
--       SELECT 1 FROM admin_users 
--       WHERE admin_users.email = auth.email()
--     )
--   );
