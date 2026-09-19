import { describe, expect, it } from 'vitest';
import { readApplyWorkerRuntimeConfig } from '../src/runtime-config';

const base: NodeJS.ProcessEnv = { JOB_HARNESS_EXECUTOR_AUTH_TOKEN: 'test-token', HOME: '/home/test' };

describe('Apply Worker runtime configuration', () => {
  it('parses safe defaults and derives a bridge URL from the Job Harness API origin', () => {
    const config = readApplyWorkerRuntimeConfig(base, 'worker-host');
    expect(config).toMatchObject({ backendId: 'steel', phase: 'readiness', executorId: 'worker-host-steel', steelHeadless: true, extensionResumeUpload: false, enableSupervisedSubmit: false, semanticMappingEnabled: false, semanticMappingModel: 'gpt-5.6-luna', semanticMappingConfidenceThreshold: 0.93 });
    expect(config.extensionBridgeUrl).toBe('http://127.0.0.1:20901/internal/browser-bridge/v1');
  });

  it('rejects ambiguous booleans, partial integers and unsupported execution modes at startup', () => {
    expect(() => readApplyWorkerRuntimeConfig({ ...base, JOB_HARNESS_STEEL_HEADLESS: 'yes' })).toThrow();
    expect(() => readApplyWorkerRuntimeConfig({ ...base, JOB_HARNESS_APPLY_LEASE_SECONDS: '90seconds' })).toThrow();
    expect(() => readApplyWorkerRuntimeConfig({ ...base, JOB_HARNESS_APPLY_PHASE: 'auto-submit' })).toThrow();
    expect(() => readApplyWorkerRuntimeConfig({ ...base, JOB_HARNESS_APPLY_BROWSER_BACKEND: 'extension' })).toThrow(/AGENT_ID/);
    expect(() => readApplyWorkerRuntimeConfig({ ...base, JOB_HARNESS_APPLY_LEASE_SECONDS: '20' })).toThrow(/30\.\.300/);
    expect(() => readApplyWorkerRuntimeConfig({ ...base, JOB_HARNESS_APPLY_LEASE_SECONDS: '30', JOB_HARNESS_APPLY_ATTEMPT_HEARTBEAT_MS: '30000' })).toThrow(/shorter than the attempt lease/);
    expect(() => readApplyWorkerRuntimeConfig({ ...base, JOB_HARNESS_APPLY_EXECUTOR_HEARTBEAT_MS: '60000' })).toThrow(/stale window/);
  });

  it('enables supervised submit only behind an explicit form-fill runtime flag', () => {
    expect(readApplyWorkerRuntimeConfig({
      ...base,
      JOB_HARNESS_APPLY_PHASE: 'form-fill',
      JOB_HARNESS_APPLY_ENABLE_SUPERVISED_SUBMIT: 'true',
    }).enableSupervisedSubmit).toBe(true);
    expect(readApplyWorkerRuntimeConfig({
      ...base,
      JOB_HARNESS_APPLY_PHASE: 'readiness',
      JOB_HARNESS_APPLY_ENABLE_SUPERVISED_SUBMIT: 'true',
    }).enableSupervisedSubmit).toBe(false);
    expect(() => readApplyWorkerRuntimeConfig({
      ...base,
      JOB_HARNESS_APPLY_PHASE: 'form-fill',
      JOB_HARNESS_APPLY_ENABLE_SUPERVISED_SUBMIT: 'yes',
    })).toThrow(/ENABLE_SUPERVISED_SUBMIT/);
  });

  it('enables value-free semantic mapping only with an explicit key and bounded confidence/timeout settings', () => {
    const config = readApplyWorkerRuntimeConfig({
      ...base,
      JOB_HARNESS_APPLY_PHASE: 'form-fill',
      JOB_HARNESS_APPLY_SEMANTIC_MAPPING_ENABLED: 'true',
      JOB_HARNESS_APPLY_SEMANTIC_MAPPING_API_KEY: 'semantic-key',
      JOB_HARNESS_APPLY_SEMANTIC_MAPPING_BASE_URL: 'http://127.0.0.1:4000/v1',
      JOB_HARNESS_APPLY_SEMANTIC_MAPPING_MODEL: 'gpt-5.6-luna',
      JOB_HARNESS_APPLY_SEMANTIC_MAPPING_TIMEOUT_MS: '15000',
      JOB_HARNESS_APPLY_SEMANTIC_MAPPING_CONFIDENCE_THRESHOLD: '0.95',
    });
    expect(config).toMatchObject({
      semanticMappingEnabled: true,
      semanticMappingApiKey: 'semantic-key',
      semanticMappingBaseUrl: 'http://127.0.0.1:4000/v1',
      semanticMappingModel: 'gpt-5.6-luna',
      semanticMappingTimeoutMs: 15000,
      semanticMappingConfidenceThreshold: 0.95,
    });
    expect(() => readApplyWorkerRuntimeConfig({
      ...base,
      JOB_HARNESS_APPLY_PHASE: 'form-fill',
      JOB_HARNESS_APPLY_SEMANTIC_MAPPING_ENABLED: 'true',
    })).toThrow(/SEMANTIC_MAPPING_API_KEY/);
    expect(() => readApplyWorkerRuntimeConfig({
      ...base,
      JOB_HARNESS_APPLY_PHASE: 'form-fill',
      JOB_HARNESS_APPLY_SEMANTIC_MAPPING_ENABLED: 'true',
      JOB_HARNESS_APPLY_SEMANTIC_MAPPING_API_KEY: 'semantic-key',
      JOB_HARNESS_APPLY_SEMANTIC_MAPPING_CONFIDENCE_THRESHOLD: '0.5',
    })).toThrow(/CONFIDENCE_THRESHOLD/);
  });

  it('accepts only explicit extension capability flags', () => {
    const config = readApplyWorkerRuntimeConfig({
      ...base,
      JOB_HARNESS_APPLY_BROWSER_BACKEND: 'extension',
      JOB_HARNESS_BROWSER_EXTENSION_AGENT_ID: 'windows-chrome-primary',
      JOB_HARNESS_BROWSER_EXTENSION_RESUME_UPLOAD: 'true',
      JOB_HARNESS_BROWSER_EXTENSION_SCREENSHOTS: 'false',
    });
    expect(config.extensionResumeUpload).toBe(true);
    expect(config.extensionScreenshots).toBe(false);
  });
});
