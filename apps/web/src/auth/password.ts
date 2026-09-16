import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';

export function webPasswordConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.JOB_HARNESS_WEB_PASSWORD?.trim());
}

export function verifyWebPassword(candidate: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const expected = env.JOB_HARNESS_WEB_PASSWORD?.trim();
  if (!expected) return true;
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(candidate), digest(expected));
}
