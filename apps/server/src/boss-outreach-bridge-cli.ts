import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createJobHarnessRestClient } from '@job-harness/client';
import { createBossOutreachBridge } from './boss-outreach-bridge';
import { BossDiscoveryCoordinator } from './boss-discovery';
import { patchBossResumeFollowupUserscript } from './boss-resume-followup';
import { BossRuntimeControlStore } from './boss-runtime-control';

const host = process.env.JOB_HARNESS_BOSS_BRIDGE_HOST?.trim() || '127.0.0.1';
const port = Number(process.env.JOB_HARNESS_BOSS_BRIDGE_PORT || 18788);
const baseUrl = process.env.JOB_HARNESS_BOSS_BRIDGE_PUBLIC_URL?.trim() || `http://${host}:${port}`;
const apiUrl = process.env.JOB_HARNESS_API_URL?.trim() || 'http://127.0.0.1:20901/api/v1';
const token = process.env.JOB_HARNESS_AUTH_TOKEN?.trim();
if (!token) throw new Error('JOB_HARNESS_AUTH_TOKEN is required for the BOSS outreach bridge');
if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('JOB_HARNESS_BOSS_BRIDGE_PORT must be a valid TCP port');

const client = createJobHarnessRestClient({ baseUrl: apiUrl, authToken: token, requestTimeoutMs: 30_000 });
const campaignId = process.env.JOB_HARNESS_BOSS_CAMPAIGN_ID?.trim() || '2026-grad-agent-fullstack-frontend';
const discovery = new BossDiscoveryCoordinator({
  client,
  campaignId,
  stateLogPath: process.env.JOB_HARNESS_BOSS_DISCOVERY_STATE_LOG?.trim() || join(homedir(), '.local', 'share', 'job-harness', 'data', 'boss-discovery-sessions.jsonl'),
  idleCompleteMs: Number(process.env.JOB_HARNESS_BOSS_DISCOVERY_IDLE_MS ?? 600_000),
});
await discovery.recover();
const legacyUserscriptSourcePath = process.env.JOB_HARNESS_BOSS_LEGACY_USERSCRIPT_SOURCE?.trim() || '/home/ubuntu/projects/job-harness/integrations/boss/legacy-copilot.user.js';
let resumeFollowupUserscript: string | null = null;
try {
  const source = await readFile(legacyUserscriptSourcePath, 'utf8');
  resumeFollowupUserscript = patchBossResumeFollowupUserscript(source, {
    publicUrl: `${baseUrl.replace(/\/+$/, '')}/boss-resume-followup.user.js`,
  });
} catch (error) {
  console.warn(`BOSS resume follow-up userscript is unavailable: ${error instanceof Error ? error.message : String(error)}`);
}
const runtimeControl = new BossRuntimeControlStore(
  process.env.JOB_HARNESS_BOSS_RUNTIME_STATE?.trim() || join(homedir(), '.local', 'share', 'job-harness', 'data', 'boss-runtime-control.json'),
);
await runtimeControl.recover();
const server = createBossOutreachBridge({
  client,
  publicBaseUrl: baseUrl,
  logPath: process.env.JOB_HARNESS_BOSS_OUTREACH_LOG?.trim() || join(homedir(), '.local', 'share', 'job-harness', 'data', 'boss-outreach-events.jsonl'),
  baseDelayMs: Number(process.env.JOB_HARNESS_BOSS_SCORE_DELAY_MS ?? 2500),
  delayJitterMs: Number(process.env.JOB_HARNESS_BOSS_SCORE_DELAY_JITTER_MS ?? 400),
  greetingWaitMs: Number(process.env.JOB_HARNESS_BOSS_GREETING_WAIT_MS ?? 35_000),
  interactiveResolverPriorityMs: Number(process.env.JOB_HARNESS_BOSS_CHATGPT_PRIORITY_MS ?? 10_000),
  greetingThreshold: Number(process.env.JOB_HARNESS_BOSS_GREETING_THRESHOLD ?? 58),
  campaignId,
  discovery,
  resumeFollowupUserscript,
  runtimeControl,
  runtimeTaskTtlMs: Number(process.env.JOB_HARNESS_BOSS_RUNTIME_TASK_TTL_MS ?? 3_600_000),
  controlToken: token,
});

server.listen(port, host, () => {
  console.log(`Job Harness BOSS outreach bridge listening on http://${host}:${port}`);
  console.log(`Public tailnet base: ${baseUrl}`);
});
