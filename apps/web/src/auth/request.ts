import type { NextRequest } from 'next/server';

function firstForwarded(value: string | null): string | null {
  return value?.split(',')[0]?.trim() || null;
}

export function externalRequestOrigin(request: NextRequest): string {
  const host = firstForwarded(request.headers.get('x-forwarded-host')) ?? request.headers.get('host');
  const forwardedProto = firstForwarded(request.headers.get('x-forwarded-proto'));
  const protocol = forwardedProto ? `${forwardedProto}:` : request.nextUrl.protocol;
  return host ? `${protocol}//${host}` : request.nextUrl.origin;
}

export function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin.toLowerCase() === externalRequestOrigin(request).toLowerCase();
  } catch {
    return false;
  }
}
