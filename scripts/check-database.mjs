#!/usr/bin/env node
// Database diagnostic tool - checks the MySQL connection and data
import { createPool, loadEnv } from './db-env.mjs'

async function checkDatabase() {
  console.log('Checking MySQL database connection...\n')

  let pool = null
  try {
    pool = createPool(loadEnv())
    // Check if we can connect to the database
    console.log('1. Testing database connection...')
    await pool.query('SELECT 1 AS test')
    const [[ver]] = await pool.query('SELECT VERSION() AS v')
    console.log(`Connected. Server version: ${ver.v}\n`)

    // Check if appointments table exists
    console.log('2. Checking appointments table...')
    const [tableCheck] = await pool.query(
      'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
      ['appointments']
    )
    if (tableCheck.length > 0) {
      console.log('Appointments table exists\n')
    } else {
      console.log('Appointments table NOT found - apply mysql/schema.sql\n')
      process.exitCode = 1
      return
    }

    // Check total appointments
    console.log('3. Counting total appointments...')
    const [countResult] = await pool.query('SELECT COUNT(*) AS count FROM appointments')
    console.log(`Total appointments: ${countResult[0].count}\n`)

    // Check recent appointments
    console.log('4. Checking recent appointments...')
    const [recent] = await pool.query(
      'SELECT id, patient_name, appointment_date, status, created_at FROM appointments ORDER BY created_at DESC LIMIT 5'
    )
    if (recent.length > 0) {
      console.log('Recent appointments:')
      for (const apt of recent) {
        console.log(`   - ID: ${apt.id}`)
        console.log(`     Patient: ${apt.patient_name}`)
        console.log(`     Date: ${apt.appointment_date}`)
        console.log(`     Status: ${apt.status || 'pending'}`)
        console.log(`     Created: ${apt.created_at}\n`)
      }
    } else {
      console.log('No appointments found in database\n')
    }

    // Check admin users
    console.log('5. Checking admin users...')
    const [adminCheck] = await pool.query('SELECT email FROM admin_users')
    if (adminCheck.length > 0) {
      console.log('Admin users:')
      for (const admin of adminCheck) {
        console.log(`   - ${admin.email}`)
      }
      console.log()
    } else {
      console.log('No admin users found - run seed-admin.mjs to create one\n')
    }

    console.log('Database check complete')
  } catch (error) {
    console.error('Database check failed:', error instanceof Error ? error.message : error)
    if (String(error.message).includes('Missing MySQL env')) {
      console.error('\nMySQL environment variables are not set.')
      console.error('Please set the following environment variables:')
      console.error('  - MYSQL_HOST')
      console.error('  - MYSQL_PORT')
      console.error('  - MYSQL_DATABASE')
      console.error('  - MYSQL_USER')
      console.error('  - MYSQL_PASSWORD')
    }
    process.exitCode = 1
  } finally {
    if (pool) await pool.end()
  }
}

await checkDatabase()
