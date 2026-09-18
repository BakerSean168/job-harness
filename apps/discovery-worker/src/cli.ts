import { createJobHarnessRestClient } from '@job-harness/client';
import { readDiscoveryWorkerConfig } from './config';
import { DiscoveryWorker } from './runtime';
import { ZhilianDiscoveryProvider } from './zhilian-provider';
import { LiepinDiscoveryProvider } from './liepin-provider';

const config = readDiscoveryWorkerConfig();
const client = createJobHarnessRestClient({ baseUrl: config.apiUrl, authToken: config.authToken, requestTimeoutMs: 45_000 });
const provider = config.provider === 'liepin' ? new LiepinDiscoveryProvider(config.liepin) : new ZhilianDiscoveryProvider(config.zhilian);
const worker = new DiscoveryWorker({ client, provider, campaignId: config.campaignId });
const result = await worker.runOnce();
console.log(JSON.stringify(result));
