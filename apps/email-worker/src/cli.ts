import { createJobHarnessRestClient } from '@job-harness/client';
import { readEmailWorkerConfig } from './config';
import { EmailDeliveryWorker } from './runtime';
import { SmtpEmailProvider } from './smtp-provider';

const config = readEmailWorkerConfig();
const client = createJobHarnessRestClient({ baseUrl: config.apiUrl, authToken: config.authToken, requestTimeoutMs: 30_000 });
const provider = new SmtpEmailProvider(config.smtp);
const worker = new EmailDeliveryWorker({ client, provider, batchLimit: config.batchLimit });
let stopped = false;
process.on('SIGTERM', () => { stopped = true; });
process.on('SIGINT', () => { stopped = true; });

while (!stopped) {
  try {
    const result = await worker.runOnce();
    if (result.scanned > 0) console.log('Email delivery pass', JSON.stringify(result));
  } catch (error) {
    console.error('Email delivery pass failed', error instanceof Error ? error.message : String(error));
  }
  await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
}
