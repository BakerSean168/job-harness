import { describe, expect, it } from 'vitest';
import { readResumeRendererRuntimeConfig } from '../src/runtime-config';

describe('Resume renderer runtime configuration', () => {
  it('uses bounded defaults', () => {
    expect(readResumeRendererRuntimeConfig({})).toMatchObject({ host: '127.0.0.1', port: 3002, executablePath: '/usr/bin/chromium', authToken: null });
  });
  it('rejects partial ports and unauthenticated public binds', () => {
    expect(() => readResumeRendererRuntimeConfig({ JOB_HARNESS_RENDERER_PORT: '3002x' })).toThrow();
    expect(() => readResumeRendererRuntimeConfig({ JOB_HARNESS_RENDERER_HOST: '0.0.0.0' })).toThrow(/RENDERER_TOKEN/);
  });
});
