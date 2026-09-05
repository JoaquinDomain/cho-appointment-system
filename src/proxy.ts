import { NextResponse, type NextRequest } from 'next/server'

// Admin sessions are opaque tokens in httpOnly cookies, verified per-request
// inside the /api routes against D1 (see src/lib/session.ts). This proxy is
// intentionally a pass-through: no per-request database lookup at the edge.
// It does NOT grant access — every admin API re-verifies the session.
export default async function proxy(request: NextRequest) {
  return NextResponse.next({ request })
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
}
