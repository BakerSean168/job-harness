import { describe, expect, it } from 'vitest';
import { readServerRuntimeConfig } from '../src/runtime-config';

describe('Job Harness server runtime configuration', () => {
  it('uses explicit defaults and normalizes the browser validation origin', () => {
    const config = readServerRuntimeConfig({ JOB_HARNESS_BROWSER_VALIDATION_ALLOWED_ORIGIN: 'https://example.test/path' });
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3000);
    expect(config.browserExtensionValidationAllowedOrigin).toBe('https://example.test');
  });

  it('rejects partial integers, invalid URLs and unauthenticated public binds before startup', () => {
    expect(() => readServerRuntimeConfig({ JOB_HARNESS_PORT: '3000x' })).toThrow();
    expect(() => readServerRuntimeConfig({ JOB_HARNESS_RESUME_RENDERER_URL: 'not-a-url' })).toThrow();
    expect(() => readServerRuntimeConfig({ JOB_HARNESS_HOST: '0.0.0.0' })).toThrow(/AUTH_TOKEN/);
    expect(() => readServerRuntimeConfig({ JOB_HARNESS_SUBMISSION_RECONCILE_BATCH_SIZE: '0' })).toThrow();
  });
});
