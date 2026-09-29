import { spawn } from 'node:child_process';
import { hostname } from 'node:os';
import { z } from 'zod';
import { BossGreetingRequestSchema } from '@job-harness/mcp';
import { BossGreetingProviderResolutionSchema, createOpenAICompatibleBossGreetingProvider, type BossGreetingProvider } from '../src/boss-greeting-provider';

const ClaimResponseSchema = z.object({
  ok: z.literal(true),
  mode: z.literal('leased-chatgpt-assisted'),
  claim: z.object({
    request: BossGreetingRequestSchema,
    leaseToken: z.string().uuid(),
    owner: z.string().trim().min(3).max(120),
    claimedAt: z.iso.datetime({ offset: true }),
    leaseExpiresAt: z.iso.datetime({ offset: true }),
  }).strict().nullable(),
}).strict();

const bridgeUrl = (process.env.JOB_HARNESS_BOSS_GREETING_BRIDGE_URL?.trim() || 'http://127.0.0.1:18788').replace(/\/+$/, '');
const authToken = process.env.JOB_HARNESS_AUTH_TOKEN?.trim() || '';
const providerCommand = process.env.JOB_HARNESS_BOSS_GREETING_RESOLVER_COMMAND?.trim() || '';
const providerKind = process.env.JOB_HARNESS_BOSS_GREETING_PROVIDER_KIND?.trim() || (providerCommand ? 'command' : 'openai-compatible');
const owner = (process.env.JOB_HARNESS_BOSS_GREETING_RESOLVER_OWNER?.trim() || `resolver-${hostname()}`).slice(0, 120);
const pollMs = boundedInt(process.env.JOB_HARNESS_BOSS_GREETING_RESOLVER_POLL_MS, 1_000, 250, 10_000);
const leaseMs = boundedInt(process.env.JOB_HARNESS_BOSS_GREETING_RESOLVER_LEASE_MS, 20_000, 5_000, 30_000);
const providerMaxMs = boundedInt(process.env.JOB_HARNESS_BOSS_GREETING_RESOLVER_PROVIDER_TIMEOUT_MS, 18_000, 1_000, 28_000);

if (!authToken) throw new Error('JOB_HARNESS_AUTH_TOKEN is required for the BOSS greeting resolver worker');
if (!bridgeUrl.startsWith('http://')) throw new Error('BOSS greeting resolver worker requires a private/internal HTTP bridge URL');

function createProvider(): BossGreetingProvider {
  if (providerKind === 'openai-compatible') {
    return createOpenAICompatibleBossGreetingProvider({
      baseUrl: process.env.JOB_HARNESS_BOSS_GREETING_PROVIDER_BASE_URL?.trim() || 'https://api.deepseek.com/v1',
      apiKey: process.env.JOB_HARNESS_BOSS_GREETING_PROVIDER_API_KEY?.trim() || '',
      model: process.env.JOB_HARNESS_BOSS_GREETING_PROVIDER_MODEL?.trim() || 'deepseek-v4-flash',
      source: process.env.JOB_HARNESS_BOSS_GREETING_PROVIDER_SOURCE?.trim() || undefined,
    });
  }
  if (providerKind === 'command') {
    if (!providerCommand) throw new Error('JOB_HARNESS_BOSS_GREETING_RESOLVER_COMMAND is required for command provider mode');
    return {
      providerId: 'command-provider',
      resolve: runCommandProvider,
    };
  }
  throw new Error(`Unsupported BOSS greeting provider kind: ${providerKind}`);
}

let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

function boundedInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.trunc(parsed))) : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function jsonRequest(path: string, init: RequestInit = {}, privileged = false): Promise<unknown> {
  const response = await fetch(`${bridgeUrl}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(privileged ? { authorization: `Bearer ${authToken}` } : {}),
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error?: unknown }).error)
      : `http_${response.status}`;
    throw new Error(`BOSS greeting resolver bridge request failed: ${detail}`);
  }
  return payload;
}

async function runCommandProvider(request: z.infer<typeof BossGreetingRequestSchema>, timeoutMs: number): Promise<z.infer<typeof BossGreetingProviderResolutionSchema>> {
  const child = spawn('/bin/sh', ['-lc', providerCommand], { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
  child.stdin.end(`${JSON.stringify({ request })}\n`);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { if (stdout.length < 65_536) stdout += String(chunk); });
  child.stderr.on('data', (chunk) => { if (stderr.length < 16_384) stderr += String(chunk); });
  const exitCode = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`resolver provider timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => { clearTimeout(timer); resolve(code ?? 1); });
  });
  if (exitCode !== 0) throw new Error(`resolver provider exited ${exitCode}: ${stderr.trim().slice(0, 1000)}`);
  const line = stdout.trim();
  if (!line) throw new Error('resolver provider returned empty stdout');
  return BossGreetingProviderResolutionSchema.parse(JSON.parse(line));
}

const provider = createProvider();

async function release(id: string, leaseToken: string, reason: string): Promise<void> {
  await jsonRequest(`/api/greetings/${encodeURIComponent(id)}/release`, {
    method: 'POST',
    body: JSON.stringify({ leaseToken, reason: reason.slice(0, 240) }),
  }).catch((error) => console.error(`[boss-greeting-resolver] failed to release lease ${id}:`, error));
}

async function iteration(): Promise<boolean> {
  const claimed = ClaimResponseSchema.parse(await jsonRequest('/api/greetings/claim', {
    method: 'POST',
    body: JSON.stringify({ owner, leaseMs }),
  }, true));
  const claim = claimed.claim;
  if (!claim) return false;

  const remainingMs = Date.parse(claim.leaseExpiresAt) - Date.now();
  const timeoutMs = Math.max(500, Math.min(providerMaxMs, remainingMs - 500));
  if (timeoutMs < 1_000) {
    await release(claim.request.id, claim.leaseToken, 'insufficient-lease-time');
    return true;
  }

  try {
    const resolution = await provider.resolve(claim.request, timeoutMs);
    const body = resolution.action === 'send'
      ? { action: 'send', message: resolution.message, source: resolution.source, leaseToken: claim.leaseToken }
      : { action: 'skip', reason: resolution.reason, source: resolution.source, leaseToken: claim.leaseToken };
    await jsonRequest(`/api/greetings/${encodeURIComponent(claim.request.id)}/resolve`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    console.log(`[boss-greeting-resolver] resolved ${claim.request.id} via ${resolution.source} (${resolution.action})`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[boss-greeting-resolver] provider failed for ${claim.request.id}: ${reason}`);
    await release(claim.request.id, claim.leaseToken, `provider-failed:${reason}`);
  }
  return true;
}

console.log(`[boss-greeting-resolver] started owner=${owner} provider=${provider.providerId} pollMs=${pollMs} leaseMs=${leaseMs}`);
while (!stopping) {
  try {
    const worked = await iteration();
    if (!worked) await sleep(pollMs);
  } catch (error) {
    console.error('[boss-greeting-resolver] iteration failed:', error);
    await sleep(pollMs);
  }
}
console.log('[boss-greeting-resolver] stopped');
