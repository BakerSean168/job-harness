import { describe, expect, it } from 'vitest';
import type { DiscoveryRun } from '@job-harness/contracts';
import {
  runRecruitmentCollectionCanary,
  type RecruitmentCollectionCanaryPort,
  type RecruitmentCollectionCanaryRuntimeStatus,
} from '../src/recruitment-runtime/collection-canary';

function status(browserConnected = false): RecruitmentCollectionCanaryRuntimeStatus {
  return {
    descriptor: { runtimeId: 'get-jobs-zhilian', runtimeVersion: 'runtime-v1' },
    health: {
      runtimeId: 'get-jobs-zhilian',
      site: 'zhilian',
      state: 'ready',
      browserConnected,
      activeTaskId: null,
      lastEventAt: null,
      detail: browserConnected ? 'running' : 'idle',
      checkedAt: '2026-09-21T13:00:00.000Z',
    },
    integration: 'job-harness',
    collectOnly: true,
    mode: 'collect-only',
  };
}

function harness(options: { finalApplications?: number; reused?: boolean } = {}) {
  let now = Date.parse('2026-09-21T13:00:00.000Z');
  let applicationReads = 0;
  let statusReads = 0;
  let stopCalls = 0;
  let syncCalls = 0;
  const completions: any[] = [];
  const run: DiscoveryRun = {
    id: 'run-canary',
    campaignId: 'campaign-1',
    executor: 'other',
    contextSnapshot: {},
    startedAt: new Date(now).toISOString(),
    completedAt: null,
    status: 'running',
    failureCode: null,
    failureReason: null,
    candidateCount: 0,
    insertedCount: 0,
    duplicateCount: 0,
    rejectedCount: 0,
  };

  const port: RecruitmentCollectionCanaryPort = {
    now: () => new Date(now),
    sleep: async (ms) => { now += ms; },
    getApplicationCount: async () => {
      applicationReads += 1;
      return applicationReads === 1 ? 42 : options.finalApplications ?? 42;
    },
    beginDiscovery: async () => run,
    completeDiscovery: async (input) => {
      completions.push(input);
      return {
        ...run,
        completedAt: input.completedAt,
        status: input.status ?? 'succeeded',
        failureCode: input.failureCode ?? null,
        failureReason: input.failureReason ?? null,
        candidateCount: input.candidateCount,
        insertedCount: input.insertedCount,
        duplicateCount: input.duplicateCount,
        rejectedCount: input.rejectedCount,
      };
    },
    runtimeStatus: async () => {
      statusReads += 1;
      if (statusReads === 1) return status(false);
      if (statusReads === 2) return status(true);
      return status(false);
    },
    runtimeStart: async () => ({
      site: 'zhilian',
      success: true,
      message: options.reused ? 'already running' : 'started',
      status: 'started',
      reused: options.reused ?? false,
      campaignId: 'campaign-1',
      city: '杭州',
      keywords: ['Agent', '全栈开发', '前端开发'],
    }),
    runtimeStop: async () => {
      stopCalls += 1;
      return {
        site: 'zhilian',
        success: true,
        message: 'stopped',
        status: 'stopped',
        reused: false,
        campaignId: null,
        city: null,
        keywords: [],
      };
    },
    runtimeSync: async () => {
      syncCalls += 1;
      return {
        site: 'zhilian',
        upstreamTotal: 3,
        scanned: 3,
        normalized: 3,
        normalizationRejected: 0,
        inserted: 1,
        updated: 1,
        duplicate: 1,
        persistenceRejected: 0,
      };
    },
  };

  return {
    port,
    completions,
    get stopCalls() { return stopCalls; },
    get syncCalls() { return syncCalls; },
  };
}

describe('recruitment collection canary orchestration', () => {
  it('accepts a bounded collect-only run only when canonical sync succeeds and Applications stay unchanged', async () => {
    const h = harness();
    const result = await runRecruitmentCollectionCanary(h.port, {
      site: 'zhilian',
      campaignId: 'campaign-1',
      city: '杭州',
      runForMs: 5_000,
      pollEveryMs: 500,
    });

    expect(result).toMatchObject({
      accepted: true,
      baselineApplications: 42,
      finalApplications: 42,
      observedRunning: true,
      failureCode: null,
      run: {
        status: 'succeeded',
        candidateCount: 3,
        insertedCount: 1,
        duplicateCount: 2,
        rejectedCount: 0,
      },
    });
    expect(h.stopCalls).toBe(1);
    expect(h.syncCalls).toBe(1);
    expect(h.completions[0]).toMatchObject({
      status: 'succeeded',
      failureCode: null,
      failureReason: null,
      candidateCount: 3,
      insertedCount: 1,
      duplicateCount: 2,
      rejectedCount: 0,
    });
  });

  it('fails the durable DiscoveryRun if collection changes Application truth', async () => {
    const h = harness({ finalApplications: 43 });
    const result = await runRecruitmentCollectionCanary(h.port, {
      site: 'zhilian',
      campaignId: 'campaign-1',
      runForMs: 5_000,
      pollEveryMs: 500,
    });

    expect(result).toMatchObject({
      accepted: false,
      baselineApplications: 42,
      finalApplications: 43,
      failureCode: 'application_count_changed',
      run: { status: 'failed', failureCode: 'application_count_changed' },
    });
    expect(h.stopCalls).toBe(1);
    expect(h.syncCalls).toBe(1);
  });

  it('never stops or syncs a pre-existing runtime task that start reports as reused', async () => {
    const h = harness({ reused: true });
    const result = await runRecruitmentCollectionCanary(h.port, {
      site: 'zhilian',
      campaignId: 'campaign-1',
      runForMs: 5_000,
    });

    expect(result).toMatchObject({
      accepted: false,
      failureCode: 'runtime_task_reused',
      run: { status: 'failed', failureCode: 'runtime_task_reused' },
    });
    expect(h.stopCalls).toBe(0);
    expect(h.syncCalls).toBe(0);
  });

  it('refuses a canary before opening a DiscoveryRun when the runtime needs login', async () => {
    let beginCalls = 0;
    const h = harness();
    const port: RecruitmentCollectionCanaryPort = {
      ...h.port,
      beginDiscovery: async (input) => {
        beginCalls += 1;
        return h.port.beginDiscovery(input);
      },
      runtimeStatus: async () => ({
        ...status(false),
        health: { ...status(false).health, state: 'login-required' },
      }),
    };

    await expect(runRecruitmentCollectionCanary(port, {
      site: 'zhilian',
      campaignId: 'campaign-1',
    })).rejects.toThrow(/not ready: login-required/);
    expect(beginCalls).toBe(0);
  });
});
