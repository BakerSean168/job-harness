import { NextRequest, NextResponse } from 'next/server';
import { getWebAuthRuntimeConfig, verifyWebSessionToken, WEB_SESSION_COOKIE } from './auth/session';

const PUBLIC_PATHS = new Set(['/login', '/auth/login', '/labs/apply-canary']);

export async function proxy(request: NextRequest) {
  const config = getWebAuthRuntimeConfig();
  if (!config.enabled) return NextResponse.next();

  const pathname = request.nextUrl.pathname;
  if (PUBLIC_PATHS.has(pathname)) {
    if (pathname === '/login') {
      const headers = new Headers(request.headers);
      headers.set('x-job-harness-public-shell', 'login');
      return NextResponse.next({ request: { headers } });
    }
    return NextResponse.next();
  }

  if (!config.configured || !config.sessionSecret) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('error', 'config');
    return NextResponse.redirect(url);
  }

  const valid = await verifyWebSessionToken(
    request.cookies.get(WEB_SESSION_COOKIE)?.value,
    config.sessionSecret,
  );
  if (valid) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
