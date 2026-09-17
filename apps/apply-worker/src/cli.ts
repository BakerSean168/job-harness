import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { BrowserBackendRegistry, LocalCdpBrowserBackend, SteelBrowserBackend } from '@job-harness/apply-browser';
import type { ExecutorDescriptor } from '@job-harness/apply-contracts';
import { ApplySiteAdapterRegistry, GenericAtsSiteAdapter } from '@job-harness/apply-adapters';
import { createJobHarnessRestClient } from '@job-harness/client';
import { FormFillExecutionEngine } from './form-fill-engine';
import { ApplyWorker } from './runtime';

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Invalid ${name}: ${raw}`);
  return value;
}

const apiUrl = process.env.JOB_HARNESS_API_URL ?? 'http://127.0.0.1:20901/api/v1';
const token = process.env.JOB_HARNESS_EXECUTOR_AUTH_TOKEN?.trim();
if (!token) throw new Error('JOB_HARNESS_EXECUTOR_AUTH_TOKEN is required');
const backendId = (process.env.JOB_HARNESS_APPLY_BROWSER_BACKEND ?? 'steel').trim();
const executorId = (process.env.JOB_HARNESS_APPLY_EXECUTOR_ID ?? `${hostname()}-${backendId}`).trim();
const phase = (process.env.JOB_HARNESS_APPLY_PHASE ?? 'readiness').trim().toLowerCase();
if (!['readiness', 'form-fill'].includes(phase)) {
  throw new Error(`Unsupported JOB_HARNESS_APPLY_PHASE: ${phase}. Supported phases are readiness and form-fill; real submit stays disabled until a verified site adapter is explicitly configured.`);
}
const registry = new BrowserBackendRegistry();

if (backendId === 'steel') {
  registry.register(new SteelBrowserBackend({
    baseUrl: process.env.JOB_HARNESS_STEEL_BASE_URL ?? 'http://127.0.0.1:3000',
    viewerBaseUrl: process.env.JOB_HARNESS_STEEL_VIEWER_BASE_URL ?? null,
    apiKey: process.env.STEEL_API_KEY ?? null,
    contextPath: resolve(process.env.JOB_HARNESS_STEEL_CONTEXT_PATH ?? `${process.env.HOME ?? '/tmp'}/.local/share/job-harness/apply-worker/steel-context.json`),
    timezone: process.env.JOB_HARNESS_APPLY_BROWSER_TIMEZONE ?? 'Asia/Shanghai',
    headless: (process.env.JOB_HARNESS_STEEL_HEADLESS ?? 'true').toLowerCase() !== 'false',
    proxyUrl: process.env.JOB_HARNESS_STEEL_PROXY_URL ?? null,
  }));
} else if (backendId === 'local-cdp') {
  registry.register(new LocalCdpBrowserBackend({ endpoint: process.env.JOB_HARNESS_LOCAL_CDP_URL ?? 'http://127.0.0.1:9222' }));
} else {
  throw new Error(`Unsupported JOB_HARNESS_APPLY_BROWSER_BACKEND: ${backendId}`);
}

const siteAdapters = phase === 'form-fill' ? new ApplySiteAdapterRegistry([new GenericAtsSiteAdapter()]) : null;
const formFillEngine = siteAdapters ? new FormFillExecutionEngine({ siteAdapters }) : null;
const adapterId = phase === 'form-fill' ? 'generic-ats' : 'readiness-v1';

const descriptor: ExecutorDescriptor = {
  executorId,
  name: process.env.JOB_HARNESS_APPLY_EXECUTOR_NAME ?? `Job Harness Apply Worker (${backendId})`,
  version: '0.2.0',
  hostLabel: process.env.JOB_HARNESS_APPLY_HOST_LABEL ?? hostname(),
  status: 'ready',
  browserBackends: [backendId],
  adapterIds: [adapterId],
  executionModes: ['fill_only'],
  capabilities: {
    resumeUpload: true,
    humanControl: true,
    persistentSession: true,
    screenshots: true,
    semanticMapping: false,
  },
  maxConcurrency: 1,
  metadata: { phase: phase === 'form-fill' ? 'R019-shadow-form-fill' : 'R019-readiness', sideEffects: false, applicantData: phase === 'form-fill' ? 'lease-scoped-resume-revision' : 'none' },
};

const client = createJobHarnessRestClient({ baseUrl: apiUrl, authToken: token });
const worker = new ApplyWorker({
  client: client.apply,
  backends: registry,
  descriptor,
  backendId,
  adapterId,
  ...(formFillEngine ? { formFillEngine } : {}),
  pollIntervalMs: positiveInt('JOB_HARNESS_APPLY_POLL_INTERVAL_MS', 3_000),
  executorHeartbeatIntervalMs: positiveInt('JOB_HARNESS_APPLY_EXECUTOR_HEARTBEAT_MS', 20_000),
  attemptHeartbeatIntervalMs: positiveInt('JOB_HARNESS_APPLY_ATTEMPT_HEARTBEAT_MS', 20_000),
  leaseSeconds: positiveInt('JOB_HARNESS_APPLY_LEASE_SECONDS', 90),
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

console.log(`Apply Worker ${executorId} starting: Job Harness=${apiUrl} backend=${backendId} phase=${phase} adapter=${adapterId} mode=fill_only sideEffects=false`);
await worker.start();
