import { NextResponse, type NextRequest } from 'next/server';

// Optimistic gate only: it keeps signed-out visitors off admin pages early.
// The session itself is verified against the database in the admin layout and in every admin write route.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/admin/login' || pathname === '/admin/invite' || pathname === '/admin/reset' || request.cookies.has('sentbale-admin')) return NextResponse.next();
  const login = new URL('/admin/login', request.url);
  if (pathname !== '/admin') login.searchParams.set('next', pathname);
  return NextResponse.redirect(login);
}

export const config = { matcher: ['/admin', '/admin/:path*'] };
