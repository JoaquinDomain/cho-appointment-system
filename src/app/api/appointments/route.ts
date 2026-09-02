import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { TEST_CONFIG } from '@/lib/types'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      id,
      patient_name,
      age,
      consultation_facility,
      yakap_registered,
      yakap_facility,
      selected_tests,
      appointment_date
    } = body

    if (!patient_name || !age || !consultation_facility || !appointment_date || !Array.isArray(selected_tests) || selected_tests.length === 0) {
      return NextResponse.json({ error: 'Missing required fields or no tests selected' }, { status: 400 })
    }

    // Server-side quota validation against existing bookings for appointment_date
    const { data: existingAppointments, error: fetchError } = await supabase
      .from('appointments')
      .select('selected_tests')
      .eq('appointment_date', appointment_date)

    if (fetchError) {
      console.error('Error fetching appointments for quota check:', fetchError)
      return NextResponse.json({ error: 'Failed to validate test quotas' }, { status: 500 })
    }

    const currentCounts: Record<string, number> = {}
    if (existingAppointments) {
      for (const appt of existingAppointments) {
        if (Array.isArray(appt.selected_tests)) {
          for (const test of appt.selected_tests) {
            currentCounts[test] = (currentCounts[test] || 0) + 1
          }
        }
      }
    }

    const testConfigs = Object.values(TEST_CONFIG)
    const overLimitTests: string[] = []

    for (const testLabel of selected_tests) {
      const config = testConfigs.find(t => t.label === testLabel)
      if (config) {
        const count = currentCounts[testLabel] || 0
        if (count >= config.limit) {
          overLimitTests.push(`${testLabel} (Limit: ${config.limit}, Booked: ${count})`)
        }
      }
    }

    if (overLimitTests.length > 0) {
      return NextResponse.json(
        { error: `The following tests have reached their daily booking limit for ${appointment_date}: ${overLimitTests.join(', ')}` },
        { status: 400 }
      )
    }

    const appointmentId = id || crypto.randomUUID()

    const { error: insertError } = await supabase.from('appointments').insert({
      id: appointmentId,
      patient_name,
      age: parseInt(age),
      consultation_facility,
      yakap_registered: Boolean(yakap_registered),
      yakap_facility: yakap_registered ? yakap_facility : null,
      selected_tests,
      appointment_date
    })

    if (insertError) {
      console.error('Error inserting appointment:', insertError)
      return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: appointmentId })
  } catch (error) {
    console.error('Error in appointment POST route:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
