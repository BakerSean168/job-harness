import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { JobSearchCampaign, UpsertJobsBatchInput } from '@job-harness/contracts';
import { BossDiscoveryCoordinator, BossDiscoveryReportSchema, parseBossDiscoveryDecision, renderBossDiscoveryReporter } from '../src/boss-discovery';

let dir: string | null = null;
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); dir = null; });
const campaign: JobSearchCampaign = {
  id: 'campaign-1', name: 'AI search', targetRoles: ['AI Agent'], cities: ['杭州'], graduationYears: [2026], experience: [], keywords: ['Agent'], exclusions: [], sources: ['boss'], resumeProfileIds: ['ai-agent-forgeflow'], status: 'active', createdAt: '2026-09-18T00:00:00.000Z', updatedAt: '2026-09-18T00:00:00.000Z',
};

function harness() {
  const began: any[] = [];
  const completed: any[] = [];
  const upserts: UpsertJobsBatchInput[] = [];
  let run = 0;
  const client = {
    campaigns: { async get(id: string) { return id === campaign.id ? campaign : null; } },
    discovery: {
      async begin(input: any) { began.push(input); return { id: `run-${++run}` }; },
      async complete(input: any) { completed.push(input); return input; },
    },
    jobs: {
      async upsertJobsBatch(input: UpsertJobsBatchInput) {
        upserts.push(input);
        return { items: [{ index: 0, status: upserts.length === 1 ? 'inserted' as const : 'updated' as const, jobId: 'job-1', reason: null }] };
      },
    },
  };
  return { client, began, completed, upserts };
}

const report = BossDiscoveryReportSchema.parse({
  jobUrl: 'https://www.zhipin.com/job_detail/abc123.html?lid=x&ka=search_list_jname_1',
  title: 'Agent开发工程师', companyName: '示例科技', city: '杭州', salary: '15-25K',
  description: '负责 Agent Harness、Orchestration、MCP。', observedAt: '2026-09-18T08:00:00.000Z',
});
const decision = parseBossDiscoveryDecision({
  action: 'job_decision_consumed', screeningSessionId: 'boss-screen-1', jobUrl: report.jobUrl, title: report.title,
  salary: report.salary, score: 92, threshold: 58, screeningPassed: true,
}, { profileId: 'ai-agent-forgeflow', profileLabel: 'ForgeFlow' }, '2026-09-18T08:00:01.000Z')!;

describe('BOSS Discovery coordinator', () => {
  it('records reporter-first discovery immediately and does not duplicate when the screening decision arrives later', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-boss-discovery-'));
    const h = harness();
    const coordinator = new BossDiscoveryCoordinator({ client: h.client, campaignId: campaign.id, stateLogPath: join(dir, 'state.jsonl'), now: () => '2026-09-18T08:00:02.000Z' });
    expect(await coordinator.report(report)).toEqual({ accepted: true, correlated: false });
    expect(await coordinator.decision(decision)).toEqual({ correlated: false });
    await coordinator.completeAll();

    expect(h.began).toHaveLength(1);
    expect(h.began[0]).toMatchObject({ campaignId: campaign.id, executor: 'other', contextSnapshot: { source: 'boss-browser', screeningSessionId: 'boss-browser-daily-20260918', generation: 1 } });
    expect(h.upserts).toHaveLength(1);
    expect(h.upserts[0]!.jobs[0]).toMatchObject({
      companyName: '示例科技', title: 'Agent开发工程师', city: '杭州', discoveryRunId: 'run-1',
      listings: [{ sourceKind: 'boss', externalNamespace: 'boss', externalId: 'abc123', identityKind: 'external-id', metadataSnapshot: { score: null, screeningPassed: null, recommendedProfileId: null, screeningSessionId: 'boss-browser-daily-20260918' } }],
    });
    expect(h.upserts[0]!.jobs[0]!.listings[0]!.url).toBe('https://www.zhipin.com/job_detail/abc123.html?ka=search_list_jname_1');
    expect(h.completed).toEqual([{ runId: 'run-1', completedAt: '2026-09-18T08:00:02.000Z', candidateCount: 1, insertedCount: 1, duplicateCount: 0, rejectedCount: 0 }]);
    const state = await readFile(join(dir, 'state.jsonl'), 'utf8');
    expect(state).toContain('"type":"started"');
    expect(state).toContain('"type":"candidate"');
    expect(state).toContain('"type":"completed"');
  });

  it('also correlates when the screening decision arrives before the reporter payload', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-boss-discovery-order-'));
    const h = harness();
    const coordinator = new BossDiscoveryCoordinator({ client: h.client, campaignId: campaign.id, stateLogPath: join(dir, 'state.jsonl') });
    expect(await coordinator.decision(decision)).toEqual({ correlated: false });
    expect(await coordinator.report(report)).toEqual({ accepted: true, correlated: true });
    await coordinator.completeAll();
    expect(h.upserts).toHaveLength(1);
  });

  it('records the already-installed reporter even when the screening script is not running', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-boss-discovery-standalone-'));
    const h = harness();
    const coordinator = new BossDiscoveryCoordinator({ client: h.client, campaignId: campaign.id, stateLogPath: join(dir, 'state.jsonl') });
    expect(await coordinator.report(report)).toEqual({ accepted: true, correlated: false });
    await coordinator.completeAll();
    expect(h.began).toHaveLength(1);
    expect(h.began[0]).toMatchObject({ contextSnapshot: { screeningSessionId: 'boss-browser-daily-20260918' } });
    expect(h.upserts).toHaveLength(1);
    expect(h.upserts[0]!.jobs[0]!.listings[0]!.metadataSnapshot).toMatchObject({ score: null, recommendedProfileId: null });
  });

  it('rejects non-BOSS URLs and renders a read-only userscript with no click/send primitives', () => {
    expect(() => BossDiscoveryReportSchema.parse({ ...report, jobUrl: 'https://evil.example/job_detail/abc' })).toThrow();
    const script = renderBossDiscoveryReporter('https://oracle.example:10444');
    expect(script).toContain('@match        https://www.zhipin.com/job_detail/*');
    expect(script).toContain('https://oracle.example:10444/api/discovery/report');
    expect(script).toContain('application/ld+json');
    expect(script).not.toContain('.click(');
    expect(script).not.toContain('sendMsg');
  });
});
