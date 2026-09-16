import { NextRequest, NextResponse } from 'next/server';
import { externalRequestOrigin, isSameOriginRequest } from '@/auth/request';
import { createWebSessionToken, getWebAuthRuntimeConfig, sanitizeReturnPath, WEB_SESSION_COOKIE } from '@/auth/session';
import { verifyWebPassword } from '@/auth/password';


export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  const config = getWebAuthRuntimeConfig();
  if (!config.enabled) return NextResponse.redirect(new URL('/', externalRequestOrigin(request)), 303);
  if (!config.configured || !config.sessionSecret) return NextResponse.redirect(new URL('/login?error=config', externalRequestOrigin(request)), 303);

  const form = await request.formData();
  const password = typeof form.get('password') === 'string' ? String(form.get('password')) : '';
  const next = sanitizeReturnPath(typeof form.get('next') === 'string' ? String(form.get('next')) : '/');
  if (!verifyWebPassword(password)) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const url = new URL('/login', externalRequestOrigin(request));
    url.searchParams.set('error', 'invalid');
    url.searchParams.set('next', next);
    return NextResponse.redirect(url, 303);
  }

  const token = await createWebSessionToken(config.sessionSecret, { ttlMs: config.sessionTtlMs });
  const response = NextResponse.redirect(new URL(next, externalRequestOrigin(request)), 303);
  response.cookies.set(WEB_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
    path: '/',
    maxAge: Math.floor(config.sessionTtlMs / 1000),
  });
  return response;
}
