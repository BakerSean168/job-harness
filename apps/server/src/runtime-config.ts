import { resolve } from 'node:path';
import { z } from 'zod';

const HttpUrlSchema = z.url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'expected http(s) URL');
const PortSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(65_535));
const NonNegativeIntSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().nonnegative());
const PositiveIntSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());

function optionalTrimmed(value: string | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized || null;
}
function nonNegativeInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = optionalTrimmed(env[name]);
  return raw == null ? fallback : NonNegativeIntSchema.parse(raw);
}
function positiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = optionalTrimmed(env[name]);
  return raw == null ? fallback : PositiveIntSchema.parse(raw);
}
function optionalHttpUrl(value: string | undefined): string | null {
  const raw = optionalTrimmed(value);
  return raw == null ? null : HttpUrlSchema.parse(raw);
}

export interface ServerRuntimeConfig {
  readonly databasePath: string;
  readonly host: string;
  readonly port: number;
  readonly authToken: string | null;
  readonly executorAuthToken: string | null;
  readonly browserExtensionSigningKey: string | null;
  readonly browserExtensionValidationAllowedOrigin: string | null;
  readonly artifactDirectory: string | undefined;
  readonly resumeRendererUrl: string | null;
  readonly resumeRendererToken: string | null;
  readonly submissionReconcileIntervalMs: number;
  readonly submissionStaleAfterMs: number;
  readonly submissionMaxAutomaticRetries: number;
  readonly submissionReconcileBatchSize: number;
}

export function readServerRuntimeConfig(env: NodeJS.ProcessEnv = process.env): ServerRuntimeConfig {
  const host = z.string().trim().min(1).max(255).parse(optionalTrimmed(env.JOB_HARNESS_HOST) ?? '127.0.0.1');
  const authToken = optionalTrimmed(env.JOB_HARNESS_AUTH_TOKEN);
  if ((host === '0.0.0.0' || host === '::') && !authToken) {
    throw new Error('JOB_HARNESS_AUTH_TOKEN is required when binding to a non-loopback interface');
  }
  const validationOrigin = optionalHttpUrl(env.JOB_HARNESS_BROWSER_VALIDATION_ALLOWED_ORIGIN);
  return {
    databasePath: resolve(optionalTrimmed(env.JOB_HARNESS_DB) ?? './data/job-harness.db'),
    host,
    port: PortSchema.parse(optionalTrimmed(env.JOB_HARNESS_PORT) ?? '3000'),
    authToken,
    executorAuthToken: optionalTrimmed(env.JOB_HARNESS_EXECUTOR_AUTH_TOKEN),
    browserExtensionSigningKey: optionalTrimmed(env.JOB_HARNESS_BROWSER_EXTENSION_SIGNING_KEY),
    browserExtensionValidationAllowedOrigin: validationOrigin ? new URL(validationOrigin).origin : null,
    artifactDirectory: optionalTrimmed(env.JOB_HARNESS_RESUME_ARTIFACT_DIR) ?? undefined,
    resumeRendererUrl: optionalHttpUrl(env.JOB_HARNESS_RESUME_RENDERER_URL),
    resumeRendererToken: optionalTrimmed(env.JOB_HARNESS_RENDERER_TOKEN),
    submissionReconcileIntervalMs: nonNegativeInt(env, 'JOB_HARNESS_SUBMISSION_RECONCILE_INTERVAL_MS', 300_000),
    submissionStaleAfterMs: nonNegativeInt(env, 'JOB_HARNESS_SUBMISSION_STALE_AFTER_MS', 7_200_000),
    submissionMaxAutomaticRetries: nonNegativeInt(env, 'JOB_HARNESS_SUBMISSION_MAX_AUTOMATIC_RETRIES', 8),
    submissionReconcileBatchSize: positiveInt(env, 'JOB_HARNESS_SUBMISSION_RECONCILE_BATCH_SIZE', 100),
  };
}
