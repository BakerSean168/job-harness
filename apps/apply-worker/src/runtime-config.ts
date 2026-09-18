import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { z } from 'zod';

const HttpUrlSchema = z.url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'expected http(s) URL');
const BooleanEnvSchema = z.enum(['true', 'false']).transform((value) => value === 'true');
const PositiveIntEnvSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());

function parseNamed<T>(schema: z.ZodType<T>, value: unknown, name: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new Error(`Invalid ${name}: ${parsed.error.issues[0]?.message ?? 'invalid value'}`);
}

function optionalTrimmed(value: string | undefined): string | null {
  const result = value?.trim() ?? '';
  return result || null;
}
function positiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = optionalTrimmed(env[name]);
  return raw == null ? fallback : parseNamed(PositiveIntEnvSchema, raw, name);
}
function booleanEnv(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = optionalTrimmed(env[name]);
  return raw == null ? fallback : parseNamed(BooleanEnvSchema, raw.toLowerCase(), name);
}
function optionalHttpUrl(value: string | undefined): string | null {
  const raw = optionalTrimmed(value);
  return raw == null ? null : parseNamed(HttpUrlSchema, raw, 'URL');
}

export interface ApplyWorkerRuntimeConfig {
  readonly apiUrl: string;
  readonly token: string;
  readonly backendId: 'steel' | 'local-cdp' | 'extension';
  readonly executorId: string;
  readonly executorName: string;
  readonly hostLabel: string;
  readonly phase: 'readiness' | 'form-fill';
  readonly steelBaseUrl: string;
  readonly steelViewerBaseUrl: string | null;
  readonly steelApiKey: string | null;
  readonly steelContextPath: string;
  readonly steelTimezone: string;
  readonly steelHeadless: boolean;
  readonly steelProxyUrl: string | null;
  readonly localCdpUrl: string;
  readonly extensionAgentId: string | null;
  readonly extensionBridgeUrl: string;
  readonly extensionCommandTimeoutMs: number;
  readonly extensionResumeUpload: boolean;
  readonly extensionScreenshots: boolean;
  readonly enableSupervisedSubmit: boolean;
  readonly pollIntervalMs: number;
  readonly executorHeartbeatIntervalMs: number;
  readonly attemptHeartbeatIntervalMs: number;
  readonly leaseSeconds: number;
}

export function readApplyWorkerRuntimeConfig(env: NodeJS.ProcessEnv = process.env, hostName = hostname()): ApplyWorkerRuntimeConfig {
  const apiUrl = parseNamed(HttpUrlSchema, optionalTrimmed(env.JOB_HARNESS_API_URL) ?? 'http://127.0.0.1:20901/api/v1', 'JOB_HARNESS_API_URL');
  const token = parseNamed(z.string().trim().min(1), env.JOB_HARNESS_EXECUTOR_AUTH_TOKEN ?? '', 'JOB_HARNESS_EXECUTOR_AUTH_TOKEN');
  const backendId = parseNamed(z.enum(['steel', 'local-cdp', 'extension']), (optionalTrimmed(env.JOB_HARNESS_APPLY_BROWSER_BACKEND) ?? 'steel').toLowerCase(), 'JOB_HARNESS_APPLY_BROWSER_BACKEND');
  const phase = parseNamed(z.enum(['readiness', 'form-fill']), (optionalTrimmed(env.JOB_HARNESS_APPLY_PHASE) ?? 'readiness').toLowerCase(), 'JOB_HARNESS_APPLY_PHASE');
  const executorId = z.string().trim().min(1).max(200).parse(optionalTrimmed(env.JOB_HARNESS_APPLY_EXECUTOR_ID) ?? `${hostName}-${backendId}`);
  const extensionAgentId = optionalTrimmed(env.JOB_HARNESS_BROWSER_EXTENSION_AGENT_ID);
  if (backendId === 'extension' && !extensionAgentId) throw new Error('JOB_HARNESS_BROWSER_EXTENSION_AGENT_ID is required for extension backend');

  const serverOrigin = new URL(apiUrl);
  serverOrigin.pathname = '';
  serverOrigin.search = '';
  serverOrigin.hash = '';
  const defaultBridgeUrl = `${serverOrigin.toString().replace(/\/$/, '')}/internal/browser-bridge/v1`;
  const extensionCommandTimeoutMs = positiveInt(env, 'JOB_HARNESS_BROWSER_EXTENSION_COMMAND_TIMEOUT_MS', 30_000);
  if (extensionCommandTimeoutMs > 60_000) throw new Error('Invalid JOB_HARNESS_BROWSER_EXTENSION_COMMAND_TIMEOUT_MS: must be <= 60000');
  const executorHeartbeatIntervalMs = positiveInt(env, 'JOB_HARNESS_APPLY_EXECUTOR_HEARTBEAT_MS', 20_000);
  if (executorHeartbeatIntervalMs >= 60_000) throw new Error('Invalid JOB_HARNESS_APPLY_EXECUTOR_HEARTBEAT_MS: must stay below the 60000ms executor stale window');
  const leaseSeconds = positiveInt(env, 'JOB_HARNESS_APPLY_LEASE_SECONDS', 90);
  if (leaseSeconds < 30 || leaseSeconds > 300) throw new Error('Invalid JOB_HARNESS_APPLY_LEASE_SECONDS: expected 30..300');
  const attemptHeartbeatIntervalMs = positiveInt(env, 'JOB_HARNESS_APPLY_ATTEMPT_HEARTBEAT_MS', 20_000);
  if (attemptHeartbeatIntervalMs >= leaseSeconds * 1000) throw new Error('Invalid JOB_HARNESS_APPLY_ATTEMPT_HEARTBEAT_MS: heartbeat must be shorter than the attempt lease');

  return {
    apiUrl,
    token,
    backendId,
    executorId,
    executorName: optionalTrimmed(env.JOB_HARNESS_APPLY_EXECUTOR_NAME) ?? `Job Harness Apply Worker (${backendId})`,
    hostLabel: optionalTrimmed(env.JOB_HARNESS_APPLY_HOST_LABEL) ?? hostName,
    phase,
    steelBaseUrl: parseNamed(HttpUrlSchema, optionalTrimmed(env.JOB_HARNESS_STEEL_BASE_URL) ?? 'http://127.0.0.1:3000', 'JOB_HARNESS_STEEL_BASE_URL'),
    steelViewerBaseUrl: optionalHttpUrl(env.JOB_HARNESS_STEEL_VIEWER_BASE_URL),
    steelApiKey: optionalTrimmed(env.STEEL_API_KEY),
    steelContextPath: resolve(optionalTrimmed(env.JOB_HARNESS_STEEL_CONTEXT_PATH) ?? `${env.HOME ?? '/tmp'}/.local/share/job-harness/apply-worker/steel-context.json`),
    steelTimezone: z.string().trim().min(1).max(200).parse(optionalTrimmed(env.JOB_HARNESS_APPLY_BROWSER_TIMEZONE) ?? 'Asia/Shanghai'),
    steelHeadless: booleanEnv(env, 'JOB_HARNESS_STEEL_HEADLESS', true),
    steelProxyUrl: optionalTrimmed(env.JOB_HARNESS_STEEL_PROXY_URL) ? parseNamed(z.url(), optionalTrimmed(env.JOB_HARNESS_STEEL_PROXY_URL), 'JOB_HARNESS_STEEL_PROXY_URL') : null,
    localCdpUrl: parseNamed(HttpUrlSchema, optionalTrimmed(env.JOB_HARNESS_LOCAL_CDP_URL) ?? 'http://127.0.0.1:9222', 'JOB_HARNESS_LOCAL_CDP_URL'),
    extensionAgentId,
    extensionBridgeUrl: parseNamed(HttpUrlSchema, optionalTrimmed(env.JOB_HARNESS_BROWSER_EXTENSION_BRIDGE_URL) ?? defaultBridgeUrl, 'JOB_HARNESS_BROWSER_EXTENSION_BRIDGE_URL'),
    extensionCommandTimeoutMs,
    extensionResumeUpload: backendId === 'extension' && booleanEnv(env, 'JOB_HARNESS_BROWSER_EXTENSION_RESUME_UPLOAD', false),
    extensionScreenshots: backendId === 'extension' && booleanEnv(env, 'JOB_HARNESS_BROWSER_EXTENSION_SCREENSHOTS', false),
    enableSupervisedSubmit: phase === 'form-fill' && booleanEnv(env, 'JOB_HARNESS_APPLY_ENABLE_SUPERVISED_SUBMIT', false),
    pollIntervalMs: positiveInt(env, 'JOB_HARNESS_APPLY_POLL_INTERVAL_MS', 3_000),
    executorHeartbeatIntervalMs,
    attemptHeartbeatIntervalMs,
    leaseSeconds,
  };
}
