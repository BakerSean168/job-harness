export const WEB_SESSION_COOKIE = 'job_harness_session';
const SESSION_VERSION = 'v1';
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface WebAuthRuntimeConfig {
  enabled: boolean;
  configured: boolean;
  sessionSecret: string | null;
  sessionTtlMs: number;
  cookieSecure: boolean;
}

function parseBoolean(value: string | undefined): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

export function getWebAuthRuntimeConfig(env: NodeJS.ProcessEnv = process.env): WebAuthRuntimeConfig {
  const password = env.JOB_HARNESS_WEB_PASSWORD?.trim();
  if (!password) {
    return { enabled: false, configured: true, sessionSecret: null, sessionTtlMs: DEFAULT_TTL_MS, cookieSecure: false };
  }
  const secret = env.JOB_HARNESS_WEB_SESSION_SECRET?.trim() ?? '';
  const ttlHours = Number(env.JOB_HARNESS_WEB_SESSION_TTL_HOURS ?? '168');
  const validTtl = Number.isFinite(ttlHours) && ttlHours >= 1 && ttlHours <= 24 * 30;
  const secureOverride = parseBoolean(env.JOB_HARNESS_WEB_COOKIE_SECURE);
  return {
    enabled: true,
    configured: secret.length >= 32 && validTtl,
    sessionSecret: secret.length >= 32 ? secret : null,
    sessionTtlMs: validTtl ? ttlHours * 60 * 60 * 1000 : DEFAULT_TTL_MS,
    cookieSecure: secureOverride ?? env.NODE_ENV === 'production',
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function createWebSessionToken(
  secret: string,
  options: { nowMs?: number; ttlMs?: number; nonce?: string } = {},
): Promise<string> {
  const nowMs = options.nowMs ?? Date.now();
  const expiresAt = nowMs + (options.ttlMs ?? DEFAULT_TTL_MS);
  const nonce = options.nonce ?? bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `${SESSION_VERSION}.${expiresAt}.${nonce}`;
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(payload)));
  return `${payload}.${bytesToBase64Url(signature)}`;
}

export async function verifyWebSessionToken(
  token: string | undefined,
  secret: string,
  nowMs = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== SESSION_VERSION) return false;
  const expiresAt = Number(parts[1]);
  const nonce = parts[2];
  const signature = base64UrlToBytes(parts[3] ?? '');
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs || !nonce || !signature) return false;
  const payload = `${SESSION_VERSION}.${expiresAt}.${nonce}`;
  return crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    signature as BufferSource,
    new TextEncoder().encode(payload),
  );
}

export function sanitizeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/login') || value.startsWith('/auth/')) return '/';
  return value;
}
