import { describe, expect, it } from 'vitest';
import {
  BOSS_COMPAT_RUNTIME_DESCRIPTOR,
  countBossRuntimeExternalEffects,
  projectBossRuntimeEvents,
} from '../src/boss-site-runtime';

describe('BOSS coarse Site Runtime projection', () => {
  it('describes the upstream-backed BOSS runtime at business-task granularity', () => {
    expect(BOSS_COMPAT_RUNTIME_DESCRIPTOR).toMatchObject({
      runtimeId: 'boss-czc-good-job',
      site: 'boss',
      implementation: 'upstream-direct',
      controlGranularity: 'business-task',
      upstream: { project: 'czc-good-job', license: 'MIT' },
    });
    expect(BOSS_COMPAT_RUNTIME_DESCRIPTOR.capabilities).toContain('outreach-greeting');
    expect(BOSS_COMPAT_RUNTIME_DESCRIPTOR.capabilities).not.toContain('click');
  });

  it('counts the complete task external-effect history even when the event projection is intentionally bounded', () => {
    const rows = Array.from({ length: 620 }, (_, index) => ({
      loggedAt: new Date(Date.UTC(2026, 8, 20, 0, 0, index)).toISOString(),
      action: index % 2 === 0 ? 'greet_sent' : 'resume_sent',
      runtimeTaskId: 'task-1',
      jobId: `job-${index}`,
    }));
    rows.push({
      loggedAt: '2026-09-20T02:00:00.000Z',
      action: 'greet_sent',
      runtimeTaskId: 'task-other',
      jobId: 'job-other',
    });

    expect(projectBossRuntimeEvents(rows, { limit: 100 })).toHaveLength(100);
    expect(countBossRuntimeExternalEffects(rows, 'task-1')).toBe(620);
    expect(countBossRuntimeExternalEffects(rows, 'task-other')).toBe(1);
  });
});
