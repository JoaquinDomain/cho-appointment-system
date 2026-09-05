import { createClient } from './supabase-server'
import { getServiceRoleClient } from './supabase-admin'

function getAdminEmailSet(): Set<string> | null {
  const raw = process.env.ADMIN_EMAILS
  if (!raw) return null // fall back to allowlist table
  const emails = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return new Set(emails)
}

// Returns the authenticated user's email if they are an admin, else null.
// Strategy: verify session via anon server client, then authorize via
// ADMIN_EMAILS env (fast path) or admin_allowlist table (service_role lookup).
export async function getAdminEmail(): Promise<string | null> {
  let email: string | null = null
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.email) return null
    email = user.email.toLowerCase()
  } catch {
    return null
  }

  const allowSet = getAdminEmailSet()
  if (allowSet) return allowSet.has(email) ? email : null

  try {
    const admin = getServiceRoleClient()
    const { data } = await admin
      .from('admin_allowlist')
      .select('email')
      .eq('email', email)
      .maybeSingle()
    return data ? email : null
  } catch {
    // If allowlist table/service key is unavailable, deny by default.
    return null
  }
}

export async function requireAdmin(): Promise<{ email: string } | { error: string; status: number }> {
  const email = await getAdminEmail()
  if (!email) return { error: 'Unauthorized. Admin access required.', status: 401 }
  return { email }
}
