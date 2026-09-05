/* Secure migration probe — credentials come from environment only.
 * Usage: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 * then run: node execute-migration.js
 * NOTE: DDL must be applied manually in the Supabase SQL Editor using
 * supabase-setup.sql. The anon key cannot execute raw SQL.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    'Missing env: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function executeMigration() {
  console.log('Checking if appointments table exists...');

  const { data: existingTables, error: checkError } = await supabase
    .from('appointments')
    .select('*')
    .limit(1);

  if (checkError && checkError.code === '42P01') {
    console.log('Table does not exist.');
    console.log('Apply supabase-setup.sql manually in the Supabase SQL Editor.');
    return;
  }

  if (checkError) {
    console.error('Probe failed:', checkError.message);
    return;
  }

  if (existingTables && existingTables.length > 0) {
    console.log('Appointments table exists.');
    const sampleRecord = existingTables[0];
    console.log('Current columns:', Object.keys(sampleRecord));

    const requiredFields = ['id', 'patient_name', 'age', 'consultation_facility', 'yakap_registered', 'selected_tests', 'appointment_date', 'created_at'];
    const currentFields = Object.keys(sampleRecord);

    const missingFields = requiredFields.filter((field) => !currentFields.includes(field));

    if (missingFields.length > 0) {
      console.log('Missing fields:', missingFields);
      console.log('Apply supabase-setup.sql manually in Supabase SQL Editor');
    } else {
      console.log('Schema matches requirements.');
    }
  } else {
    console.log('Table exists but is empty');
  }
}

executeMigration().catch(console.error);
