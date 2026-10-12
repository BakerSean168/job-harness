import { setTimeout as sleep } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  BeginDiscoveryOutputSchema,
  CompleteDiscoveryOutputSchema,
  PipelineStatsOutputSchema,
} from '@job-harness/contracts';
import {
  RecruitmentCollectionRuntimeActionToolOutputSchema,
  RecruitmentCollectionRuntimeStatusToolOutputSchema,
  RecruitmentCollectionRuntimeSyncToolOutputSchema,
} from '@job-harness/mcp';
import { GetJobsRuntimeSiteSchema } from '../src/get-jobs-runtime';
import {
  runRecruitmentCollectionCanary,
  type RecruitmentCollectionCanaryPort,
} from '../src/recruitment-runtime/collection-canary';

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function numberOption(name: string, fallback: number): number {
  const raw = option(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`--${name} must be a finite number`);
  return parsed;
}

async function main(): Promise<void> {
  const site = GetJobsRuntimeSiteSchema.parse(process.argv[2] ?? 'zhilian');
  const campaignId = process.argv[3]?.trim();
  if (!campaignId || campaignId.startsWith('--')) {
    throw new Error('Usage: recruitment-collection-canary <zhilian|liepin|job51> <campaignId> [--city=杭州] [--seconds=60] [--poll-ms=2000] [--page-size=100] [--max-pages=20]');
  }

  const url = process.env.JOB_HARNESS_CHATGPT_MCP_URL?.trim() ?? 'http://127.0.0.1:20901/mcp';
  const token = process.env.JOB_HARNESS_CHATGPT_MCP_TOKEN?.trim()
    ?? process.env.JOB_HARNESS_AUTH_TOKEN?.trim()
    ?? null;
  if (!token) throw new Error('JOB_HARNESS_CHATGPT_MCP_TOKEN or JOB_HARNESS_AUTH_TOKEN is required');

  const client = new Client({ name: 'job-harness-recruitment-collection-canary', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });

  const call = async <T>(
    name: string,
    args: Record<string, unknown>,
    schema: { parse(value: unknown): T },
  ): Promise<T> => {
    const response = await client.callTool({ name, arguments: args });
    if (response.isError) {
      const detail = response.content
        ?.filter((item): item is { type: 'text'; text: string } => item.type === 'text' && 'text' in item)
        .map((item) => item.text)
        .join(' ')
        .trim();
      throw new Error(detail || `MCP tool '${name}' failed`);
    }
    return schema.parse(response.structuredContent);
  };

  await client.connect(transport);
  try {
    const port: RecruitmentCollectionCanaryPort = {
      now: () => new Date(),
      sleep: async (ms) => { await sleep(ms); },
      async getApplicationCount() {
        const pipeline = await call('career_pipeline_stats', {}, PipelineStatsOutputSchema);
        return pipeline.applications;
      },
      beginDiscovery: (input) => call('career_discovery_begin', input, BeginDiscoveryOutputSchema),
      completeDiscovery: (input) => call('career_discovery_complete', input, CompleteDiscoveryOutputSchema),
      runtimeStatus: (runtimeSite) => call(
        'recruitment_collection_runtime_status',
        { site: runtimeSite },
        RecruitmentCollectionRuntimeStatusToolOutputSchema,
      ),
      runtimeStart: (input) => call(
        'recruitment_collection_runtime_start',
        input,
        RecruitmentCollectionRuntimeActionToolOutputSchema,
      ),
      runtimeStop: (runtimeSite) => call(
        'recruitment_collection_runtime_stop',
        { site: runtimeSite },
        RecruitmentCollectionRuntimeActionToolOutputSchema,
      ),
      runtimeSync: (input) => call(
        'recruitment_collection_runtime_sync',
        input,
        RecruitmentCollectionRuntimeSyncToolOutputSchema,
      ),
    };

    const result = await runRecruitmentCollectionCanary(port, {
      site,
      campaignId,
      ...(option('city') ? { city: option('city') } : {}),
      runForMs: numberOption('seconds', 60) * 1000,
      pollEveryMs: numberOption('poll-ms', 2000),
      pageSize: numberOption('page-size', 100),
      maxPages: numberOption('max-pages', 20),
      ...(option('idempotency-key') ? { idempotencyKey: option('idempotency-key') } : {}),
    });

    console.log(JSON.stringify(result, null, 2));
    if (!result.accepted) process.exitCode = 2;
  } finally {
    await client.close().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
