export interface IntentDispatchRuntimeConfig {
  readonly apiUrl: string;
  readonly token: string;
  readonly dryRun: boolean;
  readonly limit: number;
  readonly maxDispatches: number;
}

export function readIntentDispatchRuntimeConfig(env: NodeJS.ProcessEnv = process.env): IntentDispatchRuntimeConfig {
  const apiUrl = httpUrl(env.JOB_HARNESS_API_URL?.trim() || 'http://127.0.0.1:20901/api/v1', 'JOB_HARNESS_API_URL');
  const token = env.JOB_HARNESS_AUTH_TOKEN?.trim() || '';
  if (!token) throw new Error('JOB_HARNESS_AUTH_TOKEN is required');
  return {
    apiUrl,
    token,
    dryRun: booleanEnv(env.JOB_HARNESS_INTENT_DISPATCH_DRY_RUN, false),
    limit: intEnv(env.JOB_HARNESS_INTENT_DISPATCH_LIMIT, 100, 1, 200),
    maxDispatches: intEnv(env.JOB_HARNESS_INTENT_DISPATCH_MAX_DISPATCHES, 3, 1, 20),
  };
}

function httpUrl(value: string, name: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${name} must be an http(s) URL`);
  return value;
}
function booleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null || !value.trim()) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1','true','yes','on'].includes(normalized)) return true;
  if (['0','false','no','off'].includes(normalized)) return false;
  throw new Error(`Invalid boolean value '${value}'`);
}
function intEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value == null || !value.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`Expected integer ${min}..${max}, got '${value}'`);
  return parsed;
}
