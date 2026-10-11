import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  RecruitmentRuntimeTaskSchema,
  type RecruitmentRuntimeTask,
} from '@job-harness/recruitment-runtime-contracts';

export interface BossRuntimeControlSnapshot {
  readonly task: RecruitmentRuntimeTask | null;
  readonly desiredState: 'running' | 'paused';
  readonly lifecycleState: 'running' | 'paused' | 'expired';
  readonly updatedAt: string;
  readonly reason: string | null;
}

function emptySnapshot(): BossRuntimeControlSnapshot {
  return { task: null, desiredState: 'paused', lifecycleState: 'paused', updatedAt: new Date(0).toISOString(), reason: null };
}

export class BossRuntimeControlStore {
  private state: BossRuntimeControlSnapshot = emptySnapshot();

  constructor(private readonly path: string | null = null) {}

  async recover(): Promise<BossRuntimeControlSnapshot> {
    if (!this.path) return this.state;
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8')) as Record<string, unknown>;
      const task = raw.task ? RecruitmentRuntimeTaskSchema.parse(raw.task) : null;
      const desiredState = raw.desiredState === 'running' ? 'running' : 'paused';
      const lifecycleState = raw.lifecycleState === 'expired'
        ? 'expired'
        : raw.lifecycleState === 'running'
          ? 'running'
          : raw.lifecycleState === 'paused'
            ? 'paused'
            : task
              ? desiredState
              : 'paused';
      this.state = {
        task,
        desiredState,
        lifecycleState,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
        reason: typeof raw.reason === 'string' ? raw.reason : null,
      };
    } catch {
      this.state = emptySnapshot();
    }
    return this.state;
  }

  current(): BossRuntimeControlSnapshot {
    return this.state;
  }

  async start(input: Omit<RecruitmentRuntimeTask, 'id'> & { id?: string }): Promise<BossRuntimeControlSnapshot> {
    if (this.state.task?.idempotencyKey === input.idempotencyKey) return this.state;
    const task = RecruitmentRuntimeTaskSchema.parse({
      ...input,
      id: input.id ?? `boss-runtime-${randomUUID()}`,
    });
    this.state = {
      task,
      desiredState: 'running',
      lifecycleState: 'running',
      updatedAt: new Date().toISOString(),
      reason: null,
    };
    await this.persist();
    return this.state;
  }

  async pause(taskId: string, reason: string): Promise<BossRuntimeControlSnapshot> {
    if (!this.state.task || this.state.task.id !== taskId || this.state.lifecycleState === 'expired') {
      throw new Error(`BOSS runtime task '${taskId}' is not active`);
    }
    this.state = {
      ...this.state,
      desiredState: 'paused',
      lifecycleState: 'paused',
      updatedAt: new Date().toISOString(),
      reason: reason.trim().slice(0, 500) || 'paused',
    };
    await this.persist();
    return this.state;
  }

  async expire(taskId: string, reason = 'runtime-task-expired'): Promise<BossRuntimeControlSnapshot> {
    if (!this.state.task || this.state.task.id !== taskId) {
      throw new Error(`BOSS runtime task '${taskId}' is not active`);
    }
    if (this.state.lifecycleState === 'expired') return this.state;
    this.state = {
      ...this.state,
      desiredState: 'paused',
      lifecycleState: 'expired',
      updatedAt: new Date().toISOString(),
      reason: reason.trim().slice(0, 500) || 'runtime-task-expired',
    };
    await this.persist();
    return this.state;
  }

  private async persist(): Promise<void> {
    if (!this.path) return;
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.tmp`;
    await writeFile(temp, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
    await rename(temp, this.path);
  }
}
