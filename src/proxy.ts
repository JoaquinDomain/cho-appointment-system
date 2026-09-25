import { NextResponse, type NextRequest } from 'next/server'
import { hasValidSession } from '@/lib/auth/session'

// Defense-in-depth: API paths are denied by default and public endpoints
// must be listed explicitly. Route handlers still run their own
// requireAdmin/turnstile checks — this is a second layer, not the only one.
// The /admin page itself stays reachable so the login screen can render;
// patient data is only ever fetched from session-gated API routes.
const PUBLIC_API: Array<{ path: string; methods: string[] }> = [
  { path: '/api/admin/login', methods: ['POST'] },
  { path: '/api/admin/logout', methods: ['POST'] },
  { path: '/api/quotas', methods: ['GET'] },
  { path: '/api/blocked-dates', methods: ['GET'] },
  // public booking (Turnstile + rate limits are enforced inside the route)
  { path: '/api/appointments', methods: ['POST'] },
]

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/')) {
    const isPublic = PUBLIC_API.some(
      (p) => pathname === p.path && p.methods.includes(request.method)
    )
    if (!isPublic) {
      const ok = await hasValidSession(request)
      if (!ok) {
        return NextResponse.json(
          { error: 'Unauthorized. Admin access required.' },
          { status: 401 }
        )
      }
    }
  }

  return NextResponse.next({ request })
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
}
