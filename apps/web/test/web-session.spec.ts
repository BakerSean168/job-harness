import { describe, expect, it } from 'vitest';
import {
  createWebSessionToken,
  getWebAuthRuntimeConfig,
  sanitizeReturnPath,
  verifyWebSessionToken,
} from '../src/auth/session';

const secret = '0123456789abcdef0123456789abcdef';

describe('self-hosted Web session', () => {
  it('signs, verifies, expires and rejects tampered session tokens', async () => {
    const token = await createWebSessionToken(secret, { nowMs: 1_000, ttlMs: 10_000, nonce: 'fixed-nonce' });
    expect(await verifyWebSessionToken(token, secret, 5_000)).toBe(true);
    expect(await verifyWebSessionToken(token, secret, 11_001)).toBe(false);
    expect(await verifyWebSessionToken(`${token.slice(0, -1)}x`, secret, 5_000)).toBe(false);
    expect(await verifyWebSessionToken(token, `${secret}other`, 5_000)).toBe(false);
  });

  it('fails configuration closed when auth is enabled without a strong session secret', () => {
    expect(getWebAuthRuntimeConfig({})).toMatchObject({ enabled: false, configured: true });
    expect(getWebAuthRuntimeConfig({ JOB_HARNESS_WEB_PASSWORD: 'secret', JOB_HARNESS_WEB_SESSION_SECRET: 'short' })).toMatchObject({ enabled: true, configured: false });
    expect(getWebAuthRuntimeConfig({
      NODE_ENV: 'production',
      JOB_HARNESS_WEB_PASSWORD: 'secret',
      JOB_HARNESS_WEB_SESSION_SECRET: secret,
      JOB_HARNESS_WEB_SESSION_TTL_HOURS: '24',
    })).toMatchObject({ enabled: true, configured: true, sessionTtlMs: 86_400_000, cookieSecure: true });
  });

  it('only accepts local absolute return paths', () => {
    expect(sanitizeReturnPath('/jobs?state=shortlisted')).toBe('/jobs?state=shortlisted');
    expect(sanitizeReturnPath('//evil.example')).toBe('/');
    expect(sanitizeReturnPath('https://evil.example')).toBe('/');
    expect(sanitizeReturnPath('/login?next=/jobs')).toBe('/');
    expect(sanitizeReturnPath('/auth/logout')).toBe('/');
  });
});
