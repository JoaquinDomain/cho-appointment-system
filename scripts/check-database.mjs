#!/usr/bin/env node
// Database diagnostic tool - checks D1 connection and data
import { d1Query, d1First } from '../src/lib/d1.js'

async function checkDatabase() {
  console.log('🔍 Checking Cloudflare D1 database connection...\n')
  
  try {
    // Check if we can connect to the database
    console.log('1. Testing database connection...')
    const result = await d1Query('SELECT 1 as test')
    console.log('✅ Database connection successful\n')
    
    // Check if appointments table exists
    console.log('2. Checking appointments table...')
    const tableCheck = await d1Query("SELECT name FROM sqlite_master WHERE type='table' AND name='appointments'")
    if (tableCheck.length > 0) {
      console.log('✅ Appointments table exists\n')
    } else {
      console.log('❌ Appointments table not found\n')
      return
    }
    
    // Check total appointments
    console.log('3. Counting total appointments...')
    const countResult = await d1Query('SELECT COUNT(*) as count FROM appointments')
    const totalCount = countResult[0]?.count || 0
    console.log(`📊 Total appointments: ${totalCount}\n`)
    
    // Check recent appointments
    console.log('4. Checking recent appointments...')
    const recent = await d1Query('SELECT * FROM appointments ORDER BY created_at DESC LIMIT 5')
    if (recent.length > 0) {
      console.log('📋 Recent appointments:')
      recent.forEach(apt => {
        console.log(`   - ID: ${apt.id}`)
        console.log(`     Patient: ${apt.patient_name}`)
        console.log(`     Date: ${apt.appointment_date}`)
        console.log(`     Status: ${apt.status || 'pending'}`)
        console.log(`     Created: ${apt.created_at}\n`)
      })
    } else {
      console.log('⚠️  No appointments found in database\n')
    }
    
    // Check admin users
    console.log('5. Checking admin users...')
    const adminCheck = await d1Query('SELECT email FROM admin_users')
    if (adminCheck.length > 0) {
      console.log('👤 Admin users:')
      adminCheck.forEach(admin => {
        console.log(`   - ${admin.email}`)
      })
      console.log()
    } else {
      console.log('⚠️  No admin users found - run seed-admin.mjs to create one\n')
    }
    
    console.log('✅ Database check complete')
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message)
    if (error.message.includes('Missing D1 env')) {
      console.error('\n⚠️  Cloudflare D1 environment variables are not set.')
      console.error('Please set the following environment variables:')
      console.error('  - CLOUDFLARE_ACCOUNT_ID')
      console.error('  - CLOUDFLARE_D1_DATABASE_ID')
      console.error('  - CLOUDFLARE_D1_API_TOKEN')
    }
    process.exit(1)
  }
}

checkDatabase()