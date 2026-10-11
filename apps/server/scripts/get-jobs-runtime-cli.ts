import { createJobHarnessRestClient } from '@job-harness/client';
import {
  GetJobsRuntimeSiteSchema,
  createGetJobsRuntimeClient,
  syncGetJobsRuntimeCache,
} from '../src/get-jobs-runtime';

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'status';
  const site = GetJobsRuntimeSiteSchema.parse(process.argv[3] ?? 'zhilian');
  const force = process.argv.includes('--force');
  const runtimeUrl = process.env.JOB_HARNESS_GET_JOBS_RUNTIME_URL?.trim();
  if (!runtimeUrl) throw new Error('JOB_HARNESS_GET_JOBS_RUNTIME_URL is required');
  const runtime = createGetJobsRuntimeClient({ baseUrl: runtimeUrl, requestTimeoutMs: 15_000 });

  if (command === 'status') {
    const [info, health] = await Promise.all([runtime.runtimeInfo(), runtime.health(site)]);
    console.log(JSON.stringify({ descriptor: runtime.descriptor(site), info, health }, null, 2));
    return;
  }
  if (command === 'login') {
    console.log(JSON.stringify(await runtime.login(site, { force }), null, 2));
    return;
  }
  if (command === 'start') {
    console.log(JSON.stringify(await runtime.startCollection(site), null, 2));
    return;
  }
  if (command === 'stop') {
    console.log(JSON.stringify(await runtime.stop(site), null, 2));
    return;
  }
  if (command === 'sync') {
    const info = await runtime.runtimeInfo();
    if (!info.collectOnly) throw new Error('Refusing canonical sync from a get_jobs runtime that is not marked collect-only');
    const token = process.env.JOB_HARNESS_AUTH_TOKEN?.trim();
    if (!token) throw new Error('JOB_HARNESS_AUTH_TOKEN is required for canonical Job sync');
    const apiUrl = process.env.JOB_HARNESS_API_URL?.trim() || 'http://127.0.0.1:20901/api/v1';
    const client = createJobHarnessRestClient({ baseUrl: apiUrl, authToken: token, requestTimeoutMs: 30_000 });
    const result = await syncGetJobsRuntimeCache(runtime, client.jobs, {
      site,
      discoveryRunId: process.env.JOB_HARNESS_GET_JOBS_DISCOVERY_RUN_ID?.trim() || null,
      pageSize: Number(process.env.JOB_HARNESS_GET_JOBS_PAGE_SIZE ?? 100),
      maxPages: Number(process.env.JOB_HARNESS_GET_JOBS_MAX_PAGES ?? 20),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error(`Unknown command '${command}'. Expected status|login [--force]|start|stop|sync.`);
}

void main();
