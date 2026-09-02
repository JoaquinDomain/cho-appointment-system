import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')

  if (!date) {
    return NextResponse.json({ error: 'Date parameter is required' }, { status: 400 })
  }

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('selected_tests')
    .eq('appointment_date', date)

  if (error) {
    console.error('Error fetching quotas:', error)
    return NextResponse.json({ error: 'Failed to fetch quota data' }, { status: 500 })
  }

  const counts: Record<string, number> = {}

  if (appointments) {
    for (const appt of appointments) {
      if (Array.isArray(appt.selected_tests)) {
        for (const test of appt.selected_tests) {
          counts[test] = (counts[test] || 0) + 1
        }
      }
    }
  }

  return NextResponse.json({ counts })
}
