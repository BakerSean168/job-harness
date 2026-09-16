import 'server-only';
import { createJobHarnessRestClient } from '@job-harness/client';

const DEFAULT_API_URL = 'http://127.0.0.1:3000/api/v1';

export function getJobHarnessClient() {
  return createJobHarnessRestClient({
    baseUrl: process.env.JOB_HARNESS_API_URL?.trim() || DEFAULT_API_URL,
    authToken: process.env.JOB_HARNESS_AUTH_TOKEN?.trim() || null,
    defaultInit: { cache: 'no-store' },
  });
}
