import type { BossBrowserBridgePort, BossBrowserScoreDecision } from './runtime';

export interface BossResumeFollowupPolicyInput {
  readonly msgs: readonly { role: 'user' | 'assistant'; content: string }[];
  readonly needResume: number;
  readonly resumeSended: boolean;
  readonly title: string;
  readonly company?: string | null;
  readonly salary?: string | null;
  readonly score: number;
  readonly resumeIndex: number;
}

export interface BossResumeFollowupPolicyDecision {
  readonly need: boolean;
  readonly reason: 'already-sent' | 'latest-not-recruiter' | 'explicit-request' | 'qualified-followup' | 'below-threshold';
}

export interface BossBridgeClient extends BossBrowserBridgePort {
  authorizeResumeFollowup(profileId: string, input: BossResumeFollowupPolicyInput): Promise<BossResumeFollowupPolicyDecision>;
  logAction(profileId: string, input: Record<string, unknown>): Promise<void>;
}

export function createBossBridgeClient(baseUrl: string): BossBridgeClient {
  const base = baseUrl.replace(/\/+$/, '');

  async function json(path: string, init: RequestInit = {}): Promise<any> {
    const response = await fetch(base + path, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error('BOSS bridge ' + path + ' failed with HTTP ' + response.status + ': ' + text.replace(/\s+/g, ' ').slice(0, 300));
    return text ? JSON.parse(text) : null;
  }

  const logAction = async (profileId: string, input: Record<string, unknown>) => {
    await json('/p/' + encodeURIComponent(profileId) + '/log-action', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  };

  return {
    async listKeywords(profileId) {
      const body = await json('/p/' + encodeURIComponent(profileId) + '/tags');
      return Array.isArray(body?.tags) ? body.tags.map(String).filter(Boolean) : [];
    },
    async score(profileId, legacyJobText) {
      return await json('/p/' + encodeURIComponent(profileId) + '/get-job-score', {
        method: 'POST',
        body: JSON.stringify({ job: legacyJobText }),
      }) as BossBrowserScoreDecision;
    },
    async reportDiscovery(input) {
      await json('/api/discovery/report', { method: 'POST', body: JSON.stringify(input) });
    },
    async logDecision(profileId, input) {
      await logAction(profileId, input);
    },
    async authorizeResumeFollowup(profileId, input) {
      return await json('/p/' + encodeURIComponent(profileId) + '/is-need-resume', {
        method: 'POST',
        body: JSON.stringify(input),
      }) as BossResumeFollowupPolicyDecision;
    },
    logAction,
  };
}
