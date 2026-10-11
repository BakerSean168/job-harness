import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BossRuntimeControlStore } from '../src/boss-runtime-control';

let dir: string | null = null;
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); dir = null; });

function taskInput(idempotencyKey: string) {
  return {
    runtimeId: 'boss-czc-good-job',
    site: 'boss' as const,
    kind: 'campaign-discovery' as const,
    campaignId: 'campaign-1',
    jobId: null,
    listingId: null,
    resumeProfileId: null,
    resumeArtifactId: null,
    targetUrl: 'https://www.zhipin.com/web/geek/job',
    policy: { collect: true, greeting: true, recruiterInbox: true, resumeFollowup: true, formFill: false, resumeUpload: false, finalSubmit: false, maxExternalEffects: 20 },
    createdAt: '2026-09-20T06:00:00.000Z',
    expiresAt: null,
    idempotencyKey,
  };
}

describe('BossRuntimeControlStore', () => {
  it('persists/recover control state and keeps start idempotency stable', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-boss-runtime-control-'));
    const path = join(dir, 'runtime.json');
    const store = new BossRuntimeControlStore(path);
    const first = await store.start(taskInput('run-1'));
    const repeated = await store.start(taskInput('run-1'));
    expect(repeated.task?.id).toBe(first.task?.id);
    expect(first.lifecycleState).toBe('running');

    const paused = await store.pause(first.task!.id, 'bounded-run-complete');
    expect(paused).toMatchObject({ desiredState: 'paused', lifecycleState: 'paused', reason: 'bounded-run-complete' });

    const repeatedAfterPause = await store.start(taskInput('run-1'));
    expect(repeatedAfterPause).toMatchObject({ desiredState: 'paused', task: { id: first.task!.id } });

    const recovered = new BossRuntimeControlStore(path);
    await expect(recovered.recover()).resolves.toMatchObject({ desiredState: 'paused', task: { id: first.task!.id, idempotencyKey: 'run-1' } });

    const second = await recovered.start(taskInput('run-2'));
    expect(second.task?.id).not.toBe(first.task?.id);
    expect(second).toMatchObject({ desiredState: 'running', lifecycleState: 'running' });

    const expired = await recovered.expire(second.task!.id);
    expect(expired).toMatchObject({
      desiredState: 'paused',
      lifecycleState: 'expired',
      reason: 'runtime-task-expired',
      task: { id: second.task!.id, idempotencyKey: 'run-2' },
    });
    await expect(recovered.pause(second.task!.id, 'too-late')).rejects.toThrow(/not active/);

    const repeatedAfterExpiry = await recovered.start(taskInput('run-2'));
    expect(repeatedAfterExpiry).toMatchObject({ lifecycleState: 'expired', task: { id: second.task!.id } });

    const recoveredExpired = new BossRuntimeControlStore(path);
    await expect(recoveredExpired.recover()).resolves.toMatchObject({
      lifecycleState: 'expired',
      task: { id: second.task!.id, idempotencyKey: 'run-2' },
    });
  });
});
