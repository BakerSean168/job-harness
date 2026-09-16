import 'server-only';
import { createJobHarnessRestClient } from '@job-harness/client';

function apiBaseUrl(): string {
  return (process.env.JOB_HARNESS_API_URL?.trim() || 'http://127.0.0.1:3000/api/v1').replace(/\/+$/, '');
}

function apiAuthToken(): string | null {
  return process.env.JOB_HARNESS_AUTH_TOKEN?.trim() || null;
}

export function getJobHarnessClient() {
  return createJobHarnessRestClient({
    baseUrl: apiBaseUrl(),
    authToken: apiAuthToken(),
  });
}

export async function fetchJobHarnessDataDownload(kind: 'export' | 'backup'): Promise<Response> {
  const headers = new Headers();
  const token = apiAuthToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(`${apiBaseUrl()}/${kind}`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });
}
