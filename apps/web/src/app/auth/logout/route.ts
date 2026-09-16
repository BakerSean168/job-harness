import { NextRequest, NextResponse } from 'next/server';
import { externalRequestOrigin, isSameOriginRequest } from '@/auth/request';
import { getWebAuthRuntimeConfig, WEB_SESSION_COOKIE } from '@/auth/session';


export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  const config = getWebAuthRuntimeConfig();
  const response = NextResponse.redirect(new URL(config.enabled ? '/login' : '/', externalRequestOrigin(request)), 303);
  response.cookies.set(WEB_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
    path: '/',
    maxAge: 0,
  });
  return response;
}
