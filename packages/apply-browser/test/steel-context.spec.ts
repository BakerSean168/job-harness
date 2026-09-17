import { describe, expect, it } from 'vitest';
import { steelContextInternals } from '../src';

describe('Steel browser backend compatibility normalization', () => {
  it('normalizes persisted storage origins without leaking backend URL shape into session data', () => {
    const normalized = steelContextInternals.normalizeSessionContextOrigins({
      localStorage: { 'example.com': { key: 'value' }, 'http://127.0.0.1:3000/path': { x: 1 } },
      sessionStorage: { 'https://foo.example/path': { y: 2 } },
    }) as { localStorage: Record<string, unknown>; sessionStorage: Record<string, unknown> };
    expect(Object.keys(normalized.localStorage)).toEqual(['https://example.com', 'http://127.0.0.1:3000']);
    expect(Object.keys(normalized.sessionStorage)).toEqual(['https://foo.example']);
  });

  it('rewrites local Steel viewer URLs to the configured backend origin', () => {
    expect(steelContextInternals.normalizeHttpUrl('http://localhost:3000/ui/session/1', 'http://127.0.0.1:3000'))
      .toBe('http://127.0.0.1:3000/ui/session/1');
  });
});
