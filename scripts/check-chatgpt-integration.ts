import { readFile } from 'node:fs/promises';
import { JOB_HARNESS_MCP_TOOLS } from '../packages/mcp/src/index';

async function main(): Promise<void> {
  const requiredTools = [
    'career_context_get',
    'career_pipeline_stats',
    'career_discovery_begin',
    'career_jobs_upsert_batch',
    'career_discovery_complete',
    'resume_profiles_list',
    'resume_authoring_context_get',
    'resume_profile_patch_selection',
    'resume_profile_patch_overrides',
    'resume_revision_publish',
    'resume_revision_artifact_materialize',
    'career_submission_intents_list',
    'career_submission_intent_prepare',
    'career_submission_intent_prepare_recommended',
    'career_email_application_prepare',
    'career_email_application_authorize_send',
    'career_submission_intent_begin',
    'career_submission_intent_confirm',
    'career_submission_intent_fail',
    'career_submission_intent_reconcile',
    'career_submission_intents_reconcile_pending',
    'boss_greetings_pending',
    'boss_greeting_resolve',
    'boss_runtime_status',
    'boss_runtime_start',
    'boss_runtime_pause',
  ] as const;

  const names = new Set(JOB_HARNESS_MCP_TOOLS.map((tool) => tool.name));
  const missing = requiredTools.filter((name) => !names.has(name));
  if (missing.length) throw new Error(`ChatGPT integration is missing required MCP tools: ${missing.join(', ')}`);

  const externalTools = JOB_HARNESS_MCP_TOOLS.filter((tool) => tool.externalSideEffect).map((tool) => tool.name);
  const expectedExternalTools = ['career_email_application_authorize_send', 'boss_greeting_resolve', 'boss_runtime_start'];
  if (JSON.stringify(externalTools) !== JSON.stringify(expectedExternalTools)) {
    throw new Error(`Unexpected MCP external-side-effect surface: ${externalTools.join(', ') || '(none)'}`);
  }

  const forbiddenNames = JOB_HARNESS_MCP_TOOLS
    .map((tool) => tool.name)
    .filter((name) => /raw_sql|database|filesystem|submit_application/.test(name));
  if (forbiddenNames.length) throw new Error(`Forbidden low-level/external-submit MCP tool exposed: ${forbiddenNames.join(', ')}`);

  const profileText = await readFile(new URL('../integrations/chatgpt/app-profile.yaml', import.meta.url), 'utf8');
  for (const name of requiredTools) {
    if (!profileText.includes(name)) throw new Error(`ChatGPT app profile does not classify required tool '${name}'`);
  }

  const workflowText = await readFile(new URL('../integrations/chatgpt/workflow-policy.md', import.meta.url), 'utf8');
  for (const invariant of ['career_submission_intent_prepare', 'career_submission_intent_prepare_recommended', 'career_email_application_prepare', 'career_email_application_authorize_send', 'career_submission_intent_begin', 'career_submission_intent_confirm', 'needs_manual_review', 'boss_greetings_pending', 'boss_greeting_resolve', 'boss_runtime_status', 'boss_runtime_start', 'boss_runtime_pause']) {
    if (!workflowText.includes(invariant)) throw new Error(`ChatGPT workflow policy is missing recovery invariant '${invariant}'`);
  }

  console.log(`chatgpt integration ok: ${JOB_HARNESS_MCP_TOOLS.length} MCP tools, ${requiredTools.length} required workflow tools, ${expectedExternalTools.length} bounded external-side-effect tools`);
}

void main();
