import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function main(): Promise<void> {
  const url = process.env.JOB_HARNESS_CHATGPT_MCP_URL ?? 'http://127.0.0.1:3000/mcp';
  const token = process.env.JOB_HARNESS_CHATGPT_MCP_TOKEN ?? process.env.JOB_HARNESS_AUTH_TOKEN ?? null;
  const required = [
    'career_context_get',
    'career_pipeline_stats',
    'resume_authoring_context_get',
    'career_submission_intent_prepare',
    'career_submission_intent_prepare_recommended',
    'career_email_application_prepare',
    'career_email_application_authorize_send',
    'career_submission_intents_reconcile_pending',
    'boss_greetings_pending',
    'boss_greeting_resolve',
    'boss_runtime_status',
    'boss_runtime_start',
    'boss_runtime_pause',
    'recruitment_collection_runtime_status',
    'recruitment_collection_runtime_start',
    'recruitment_collection_runtime_stop',
    'recruitment_collection_runtime_sync',
  ];

  const client = new Client({ name: 'job-harness-chatgpt-smoke', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    ...(token ? { requestInit: { headers: { authorization: `Bearer ${token}` } } } : {}),
  });

  try {
    await client.connect(transport);
    const catalog = await client.listTools();
    const names = catalog.tools.map((tool) => tool.name);
    const missing = required.filter((name) => !names.includes(name));
    if (missing.length) throw new Error(`MCP catalog missing required ChatGPT tools: ${missing.join(', ')}`);

    const pipeline = await client.callTool({ name: 'career_pipeline_stats', arguments: {} });
    const intents = await client.callTool({ name: 'career_submission_intents_list', arguments: { limit: 10, offset: 0 } });
    const resumes = await client.callTool({ name: 'resume_profiles_list', arguments: {} });
    const bossGreetings = await client.callTool({ name: 'boss_greetings_pending', arguments: { limit: 1 } });
    const bossRuntime = await client.callTool({ name: 'boss_runtime_status', arguments: { eventsLimit: 3 } });
    const zhilianRuntime = await client.callTool({ name: 'recruitment_collection_runtime_status', arguments: { site: 'zhilian' } });
    if (pipeline.isError || intents.isError || resumes.isError || bossGreetings.isError || bossRuntime.isError || zhilianRuntime.isError) throw new Error('One or more read-only smoke calls returned an MCP tool error');

    const pipelineData = pipeline.structuredContent as Record<string, unknown> | undefined;
    const intentData = intents.structuredContent as { total?: unknown } | undefined;
    const resumeData = resumes.structuredContent as { total?: unknown } | undefined;
    const bossGreetingData = bossGreetings.structuredContent as { total?: unknown; mode?: unknown } | undefined;
    const bossRuntimeData = bossRuntime.structuredContent as { descriptor?: { runtimeId?: unknown }; control?: { desiredState?: unknown; task?: unknown } } | undefined;
    const zhilianRuntimeData = zhilianRuntime.structuredContent as { descriptor?: { runtimeId?: unknown }; health?: { state?: unknown }; collectOnly?: unknown } | undefined;
    console.log(JSON.stringify({
      endpoint: new URL(url).origin,
      toolCount: names.length,
      requiredToolsPresent: true,
      knownJobs: pipelineData?.knownJobs ?? null,
      applications: pipelineData?.applications ?? null,
      submissionIntents: intentData?.total ?? null,
      resumeProfiles: resumeData?.total ?? null,
      pendingBossGreetings: bossGreetingData?.total ?? null,
      bossGreetingMode: bossGreetingData?.mode ?? null,
      bossRuntimeId: bossRuntimeData?.descriptor?.runtimeId ?? null,
      bossRuntimeState: bossRuntimeData?.control?.desiredState ?? null,
      bossRuntimeTaskActive: Boolean(bossRuntimeData?.control?.task),
      zhilianRuntimeId: zhilianRuntimeData?.descriptor?.runtimeId ?? null,
      zhilianRuntimeState: zhilianRuntimeData?.health?.state ?? null,
      zhilianCollectOnly: zhilianRuntimeData?.collectOnly ?? null,
    }, null, 2));
  } finally {
    await client.close().catch(() => undefined);
  }
}

void main();
