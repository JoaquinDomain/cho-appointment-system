/* Secure schema check — reads credentials from environment, never hardcoded.
 * Usage: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 * then run: node check-schema.js
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

async function checkSchema() {
  console.log('Checking appointments table (read-only probe)...');

  try {
    // Read-only probe: avoids creating/deleting test rows and avoids
    // requiring INSERT/DELETE privileges with the anon key.
    const { error } = await supabase.from('appointments').select('id').limit(1);

    if (error) {
      console.log('Schema check failed:');
      console.error('Error:', error.message);
      console.log('Run supabase-setup.sql in the Supabase SQL Editor, then retry.');
      process.exitCode = 1;
    } else {
      console.log('Appointments table is reachable. Schema probe OK.');
    }
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exitCode = 1;
  }
}

checkSchema();
