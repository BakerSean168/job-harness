function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function integer(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (['1','true','yes','on'].includes(raw)) return true;
  if (['0','false','no','off'].includes(raw)) return false;
  throw new Error(`${name} must be a boolean`);
}

export function readEmailWorkerConfig() {
  const providerEvidence = (process.env.JOB_HARNESS_EMAIL_PROVIDER_EVIDENCE?.trim() || 'other') as 'gmail' | 'outlook' | 'other';
  if (!['gmail','outlook','other'].includes(providerEvidence)) throw new Error('JOB_HARNESS_EMAIL_PROVIDER_EVIDENCE must be gmail, outlook, or other');
  return {
    apiUrl: (process.env.JOB_HARNESS_API_URL?.trim() || 'http://127.0.0.1:20901/api/v1').replace(/\/+$/, ''),
    authToken: required('JOB_HARNESS_AUTH_TOKEN'),
    pollIntervalMs: integer('JOB_HARNESS_EMAIL_POLL_INTERVAL_MS', 5000, 1000, 300_000),
    batchLimit: integer('JOB_HARNESS_EMAIL_BATCH_LIMIT', 10, 1, 100),
    smtp: {
      host: required('JOB_HARNESS_EMAIL_SMTP_HOST'),
      port: integer('JOB_HARNESS_EMAIL_SMTP_PORT', 587, 1, 65535),
      secure: bool('JOB_HARNESS_EMAIL_SMTP_SECURE', false),
      user: process.env.JOB_HARNESS_EMAIL_SMTP_USER?.trim() || null,
      password: process.env.JOB_HARNESS_EMAIL_SMTP_PASSWORD?.trim() || null,
      from: required('JOB_HARNESS_EMAIL_FROM'),
      providerEvidence,
    },
  };
}
