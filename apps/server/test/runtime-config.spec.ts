import { describe, expect, it } from 'vitest';
import { readServerRuntimeConfig } from '../src/runtime-config';

describe('Job Harness server runtime configuration', () => {
  it('uses explicit defaults and normalizes the browser validation origin', () => {
    const config = readServerRuntimeConfig({ JOB_HARNESS_BROWSER_VALIDATION_ALLOWED_ORIGIN: 'https://example.test/path' });
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3000);
    expect(config.browserExtensionValidationAllowedOrigin).toBe('https://example.test');
    expect(config.bossGreetingBridgeUrl).toBe('http://127.0.0.1:18788');
    expect(config.getJobsRuntimeUrl).toBeNull();
    expect(config.lifecycleAutoArchive).toBe(false);
    expect(config.lifecycleSweepCampaignIds).toEqual([]);
    expect(config.lifecycleSweepIntervalMs).toBe(86_400_000);
  });

  it('rejects partial integers, invalid URLs and unauthenticated public binds before startup', () => {
    expect(() => readServerRuntimeConfig({ JOB_HARNESS_PORT: '3000x' })).toThrow();
    expect(() => readServerRuntimeConfig({ JOB_HARNESS_RESUME_RENDERER_URL: 'not-a-url' })).toThrow();
    expect(() => readServerRuntimeConfig({ JOB_HARNESS_HOST: '0.0.0.0' })).toThrow(/AUTH_TOKEN/);
    expect(() => readServerRuntimeConfig({ JOB_HARNESS_SUBMISSION_RECONCILE_BATCH_SIZE: '0' })).toThrow();
    expect(() => readServerRuntimeConfig({ JOB_HARNESS_BOSS_GREETING_BRIDGE_URL: 'not-a-url' })).toThrow();
    expect(() => readServerRuntimeConfig({ JOB_HARNESS_GET_JOBS_RUNTIME_URL: 'not-a-url' })).toThrow();
    expect(() => readServerRuntimeConfig({ JOB_HARNESS_LIFECYCLE_SWEEP_INTERVAL_MS: '-1' })).toThrow();
    expect(readServerRuntimeConfig({
      JOB_HARNESS_LIFECYCLE_CAMPAIGN_IDS: 'grad-2026,intern-2026',
      JOB_HARNESS_LIFECYCLE_AUTO_ARCHIVE: 'true',
    })).toMatchObject({ lifecycleSweepCampaignIds: ['grad-2026','intern-2026'], lifecycleAutoArchive: true });
  });
});
