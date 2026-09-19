import { BrowserBackendRegistry, ExtensionBrowserBackend, LocalCdpBrowserBackend, SteelBrowserBackend } from '@job-harness/apply-browser';
import type { ExecutorDescriptor } from '@job-harness/apply-contracts';
import { ApplySiteAdapterRegistry, GenericAtsSiteAdapter, observedApplySiteAdapters } from '@job-harness/apply-adapters';
import { createJobHarnessRestClient } from '@job-harness/client';
import { FormFillExecutionEngine } from './form-fill-engine';
import { SubmitExecutionEngine } from './submit-engine';
import { ApplyWorker } from './runtime';
import { readApplyWorkerRuntimeConfig } from './runtime-config';

const config = readApplyWorkerRuntimeConfig();
const { apiUrl, token, backendId, executorId, phase } = config;
const registry = new BrowserBackendRegistry();

if (backendId === 'steel') {
  registry.register(new SteelBrowserBackend({
    baseUrl: config.steelBaseUrl,
    viewerBaseUrl: config.steelViewerBaseUrl,
    apiKey: config.steelApiKey,
    contextPath: config.steelContextPath,
    timezone: config.steelTimezone,
    headless: config.steelHeadless,
    proxyUrl: config.steelProxyUrl,
  }));
} else if (backendId === 'local-cdp') {
  registry.register(new LocalCdpBrowserBackend({ endpoint: config.localCdpUrl }));
} else if (backendId === 'extension') {
  const agentId = config.extensionAgentId!;
  registry.register(new ExtensionBrowserBackend({
    bridgeUrl: config.extensionBridgeUrl,
    executorAuthToken: token,
    agentId,
    backendId,
    commandTimeoutMs: config.extensionCommandTimeoutMs,
  }));
} else {
  throw new Error(`Unsupported JOB_HARNESS_APPLY_BROWSER_BACKEND: ${backendId}`);
}

const siteAdapters = phase === 'form-fill'
  ? new ApplySiteAdapterRegistry([
      ...observedApplySiteAdapters(),
      new GenericAtsSiteAdapter(),
    ])
  : null;
const formFillEngine = siteAdapters ? new FormFillExecutionEngine({ siteAdapters }) : null;
const submitEngine = siteAdapters && config.enableSupervisedSubmit ? new SubmitExecutionEngine({ siteAdapters }) : null;
const adapterId = phase === 'form-fill' ? 'generic-ats' : 'readiness-v1';
const advertisedAdapterIds = siteAdapters
  ? ['readiness-v1', ...siteAdapters.descriptors().map((descriptor) => descriptor.id)]
  : [adapterId];

const extensionResumeUpload = config.extensionResumeUpload;
const extensionScreenshots = config.extensionScreenshots;

const descriptor: ExecutorDescriptor = {
  executorId,
  name: config.executorName,
  version: '0.2.0',
  hostLabel: config.hostLabel,
  status: 'ready',
  browserBackends: [backendId],
  adapterIds: advertisedAdapterIds,
  executionModes: submitEngine ? ['fill_only', 'review_then_submit'] : ['fill_only'],
  capabilities: {
    resumeUpload: backendId === 'extension' ? extensionResumeUpload : true,
    humanControl: true,
    persistentSession: true,
    screenshots: backendId === 'extension' ? extensionScreenshots : true,
    semanticMapping: false,
  },
  maxConcurrency: 1,
  metadata: {
    phase: phase === 'form-fill' ? 'R019-form-fill' : 'R019-readiness',
    externalSubmit: Boolean(submitEngine),
    formFill: phase === 'form-fill',
    applicantData: phase === 'form-fill' ? 'lease-scoped-frozen-applicant-snapshot' : 'none',
    siteAdapters: advertisedAdapterIds,
    userBrowser: backendId === 'extension',
    ...(backendId === 'extension' && config.extensionAgentId ? { browserAgentId: config.extensionAgentId } : {}),
  },
};

const client = createJobHarnessRestClient({ baseUrl: apiUrl, authToken: token });
const worker = new ApplyWorker({
  client: client.apply,
  backends: registry,
  descriptor,
  backendId,
  adapterId,
  ...(formFillEngine ? { formFillEngine } : {}),
  ...(submitEngine ? { submitEngine } : {}),
  pollIntervalMs: config.pollIntervalMs,
  executorHeartbeatIntervalMs: config.executorHeartbeatIntervalMs,
  attemptHeartbeatIntervalMs: config.attemptHeartbeatIntervalMs,
  leaseSeconds: config.leaseSeconds,
});

let stopping = false;
function requestStop(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`Apply Worker received ${signal}; stopping after the current safe step`);
  worker.stop();
}
process.on('SIGINT', () => requestStop('SIGINT'));
process.on('SIGTERM', () => requestStop('SIGTERM'));

console.log(`Apply Worker ${executorId} starting: Job Harness=${apiUrl} backend=${backendId} phase=${phase} adapter=${adapterId} mode=${submitEngine ? 'review_then_submit' : 'fill_only'} sideEffects=${Boolean(submitEngine)}`);
await worker.start();
