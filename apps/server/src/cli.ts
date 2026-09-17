import { resolve } from 'node:path';
import { startJobHarnessServer } from './server';


function optionalNonNegativeInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid ${name}: ${raw}`);
  return value;
}

const databasePath = resolve(process.env.JOB_HARNESS_DB ?? './data/job-harness.db');
const host = process.env.JOB_HARNESS_HOST ?? '127.0.0.1';
const port = Number.parseInt(process.env.JOB_HARNESS_PORT ?? '3000', 10);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error(`Invalid JOB_HARNESS_PORT: ${process.env.JOB_HARNESS_PORT ?? '3000'}`);
}
const authToken = process.env.JOB_HARNESS_AUTH_TOKEN ?? null;
const executorAuthToken = process.env.JOB_HARNESS_EXECUTOR_AUTH_TOKEN ?? null;
const browserExtensionSigningKey = process.env.JOB_HARNESS_BROWSER_EXTENSION_SIGNING_KEY ?? null;
const browserExtensionValidationAllowedOrigin = process.env.JOB_HARNESS_BROWSER_VALIDATION_ALLOWED_ORIGIN ?? null;
if ((host === '0.0.0.0' || host === '::') && !authToken) {
  throw new Error('JOB_HARNESS_AUTH_TOKEN is required when binding to a non-loopback interface');
}

const running = await startJobHarnessServer({
  databasePath,
  host,
  port,
  authToken,
  executorAuthToken,
  browserExtensionSigningKey,
  browserExtensionValidationAllowedOrigin,
  artifactDirectory: process.env.JOB_HARNESS_RESUME_ARTIFACT_DIR,
  resumeRendererUrl: process.env.JOB_HARNESS_RESUME_RENDERER_URL ?? null,
  resumeRendererToken: process.env.JOB_HARNESS_RENDERER_TOKEN ?? null,
  submissionReconcileIntervalMs: optionalNonNegativeInt('JOB_HARNESS_SUBMISSION_RECONCILE_INTERVAL_MS', 300_000),
  submissionStaleAfterMs: optionalNonNegativeInt('JOB_HARNESS_SUBMISSION_STALE_AFTER_MS', 7_200_000),
  submissionMaxAutomaticRetries: optionalNonNegativeInt('JOB_HARNESS_SUBMISSION_MAX_AUTOMATIC_RETRIES', 8),
  submissionReconcileBatchSize: optionalNonNegativeInt('JOB_HARNESS_SUBMISSION_RECONCILE_BATCH_SIZE', 100),
});
console.log(`Job Harness listening at ${running.url}`);
console.log(`MCP endpoint: ${running.mcpUrl}`);

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  console.log(`Received ${signal}; shutting down Job Harness`);
  await running.close();
  process.exit(0);
}
process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
