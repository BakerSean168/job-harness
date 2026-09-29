import { BossGreetingRequestSchema } from '@job-harness/mcp';
import { createOpenAICompatibleBossGreetingProvider } from '../src/boss-greeting-provider';

const baseUrl = process.env.JOB_HARNESS_BOSS_GREETING_PROVIDER_BASE_URL?.trim() || 'https://api.deepseek.com/v1';
const apiKey = process.env.JOB_HARNESS_BOSS_GREETING_PROVIDER_API_KEY?.trim() || '';
const model = process.env.JOB_HARNESS_BOSS_GREETING_PROVIDER_MODEL?.trim() || 'deepseek-v4-flash';
const source = process.env.JOB_HARNESS_BOSS_GREETING_PROVIDER_SOURCE?.trim() || undefined;
const timeoutMs = Math.max(1_000, Math.min(28_000, Number(process.env.JOB_HARNESS_BOSS_GREETING_RESOLVER_PROVIDER_TIMEOUT_MS ?? 18_000)));

if (!apiKey) throw new Error('JOB_HARNESS_BOSS_GREETING_PROVIDER_API_KEY is required for provider smoke');

const provider = createOpenAICompatibleBossGreetingProvider({ baseUrl, apiKey, model, source });
const now = new Date();
const request = BossGreetingRequestSchema.parse({
  id: '123e4567-e89b-42d3-a456-426614174000',
  createdAt: now.toISOString(),
  expiresAt: new Date(now.getTime() + 35_000).toISOString(),
  requestedProfileId: 'ai-frontend',
  job: {
    title: '前端开发工程师',
    salary: '10-14K',
    description: '负责 Vue3、TypeScript 前端开发与工程化优化。',
    company: 'Provider Smoke Test',
    city: '深圳',
    jobUrl: 'https://www.zhipin.com/job_detail/provider-smoke.html',
    externalId: 'provider-smoke',
    screeningSessionId: 'provider-smoke',
  },
  match: {
    score: 76,
    profileId: 'ai-frontend',
    profileLabel: '前端开发工程师',
    resumeIndex: 1,
    decision: 'strong-match',
    signals: ['Vue3', 'TypeScript'],
  },
  candidate: {
    targetRole: '前端开发工程师',
    matchedSignals: ['Vue3', 'TypeScript'],
    skills: [], projects: [], workExperiences: [], summaries: [], education: [],
  },
  guidance: [
    '只使用真实提供的经历和技术证据，不得编造。',
    '默认不要主动提学校、专业或应届身份。',
    '用中文，1-3句，简洁自然。',
  ],
});

const startedAt = Date.now();
const resolution = await provider.resolve(request, timeoutMs);
console.log(JSON.stringify({
  ok: true,
  provider: provider.providerId,
  model,
  elapsedMs: Date.now() - startedAt,
  action: resolution.action,
  ...(resolution.action === 'send' ? { message: resolution.message } : { reason: resolution.reason }),
}, null, 2));
