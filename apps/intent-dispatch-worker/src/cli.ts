import { createJobHarnessRestClient } from '@job-harness/client';
import { readIntentDispatchRuntimeConfig } from './config';
import { PlannedIntentDispatcher } from './runtime';

const config = readIntentDispatchRuntimeConfig();
const client = createJobHarnessRestClient({ baseUrl: config.apiUrl, authToken: config.token, requestTimeoutMs: 30_000 });
const result = await new PlannedIntentDispatcher(client, { dryRun: config.dryRun, limit: config.limit, maxDispatches: config.maxDispatches }).runOnce();
console.log(JSON.stringify(result));
if (result.failures.length) process.exitCode = 1;
