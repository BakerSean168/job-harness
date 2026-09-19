import { createBossBridgeClient } from './bridge-client';
import { BossOutreachExtensionClient } from './outreach-extension';
import { runBossResumeFollowup } from './followup-runtime';

const config = readConfig(process.env);
if (!config.enabled) {
  console.log(JSON.stringify({ status: 'disabled', reason: 'JOB_HARNESS_BOSS_RESUME_FOLLOWUP_ENABLED=false' }, null, 2));
  process.exit(0);
}

const bridge = createBossBridgeClient(config.bridgeUrl);
const outreach = new BossOutreachExtensionClient({
  apiUrl: config.apiUrl,
  authToken: config.authToken,
  agentId: config.agentId,
});
const result = await runBossResumeFollowup({
  bridge,
  outreach,
  profileId: config.profileId,
  threshold: config.threshold,
  maxContacts: config.maxContacts,
});
console.log(JSON.stringify({ status: 'completed', ...result }, null, 2));

function readConfig(env: NodeJS.ProcessEnv) {
  return {
    enabled: bool(env.JOB_HARNESS_BOSS_RESUME_FOLLOWUP_ENABLED, false),
    bridgeUrl: httpUrl(env.JOB_HARNESS_BOSS_BRIDGE_URL?.trim() || 'http://127.0.0.1:18788', 'JOB_HARNESS_BOSS_BRIDGE_URL'),
    apiUrl: httpUrl(env.JOB_HARNESS_API_URL?.trim() || 'http://127.0.0.1:20901', 'JOB_HARNESS_API_URL'),
    authToken: env.JOB_HARNESS_AUTH_TOKEN?.trim() || '',
    agentId: env.JOB_HARNESS_BROWSER_EXTENSION_AGENT_ID?.trim() || 'windows-chrome-primary',
    profileId: env.JOB_HARNESS_BOSS_BROWSER_PROFILE_ID?.trim() || 'ai-agent-app',
    threshold: integer(env.JOB_HARNESS_BOSS_BROWSER_THRESHOLD, 58, 0, 100, 'JOB_HARNESS_BOSS_BROWSER_THRESHOLD'),
    maxContacts: integer(env.JOB_HARNESS_BOSS_FOLLOWUP_MAX_CONTACTS, 30, 1, 100, 'JOB_HARNESS_BOSS_FOLLOWUP_MAX_CONTACTS'),
  };
}

function integer(raw: string | undefined, fallback: number, min: number, max: number, name: string): number {
  const value = raw?.trim() ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(name + ' must be an integer between ' + min + ' and ' + max);
  return value;
}

function bool(raw: string | undefined, fallback: boolean): boolean {
  const value = raw?.trim().toLowerCase();
  if (!value) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  throw new Error('Expected boolean, got ' + raw);
}

function httpUrl(raw: string, name: string): string {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(name + ' must be http(s)');
  return url.toString().replace(/\/$/, '');
}
