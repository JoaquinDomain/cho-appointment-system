-- CHO Laboratory Appointment System - Supabase Setup Script

-- Create appointments table
CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name text NOT NULL,
  age integer NOT NULL,
  consultation_facility text NOT NULL,
  yakap_registered boolean DEFAULT false,
  yakap_facility text,
  selected_tests text[] NOT NULL,
  appointment_date date NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create index for faster searches
CREATE INDEX idx_appointments_patient_name ON appointments(patient_name);
CREATE INDEX idx_appointments_consultation_facility ON appointments(consultation_facility);
CREATE INDEX idx_appointments_appointment_date ON appointments(appointment_date);

-- Enable Row Level Security
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public inserts
CREATE POLICY "Allow public inserts" ON appointments FOR INSERT WITH CHECK (true);

-- Policy: Allow authenticated admin read
CREATE POLICY "Allow authenticated admin read" ON appointments FOR SELECT USING (auth.role() = 'authenticated');
