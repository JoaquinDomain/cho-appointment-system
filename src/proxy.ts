import { NextResponse, type NextRequest } from 'next/server'

// Session is checked inside the api routes using D1.
// This proxy just lets the request through, it does not allow access by itself.
export default async function proxy(request: NextRequest) {
  return NextResponse.next({ request })
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
}
