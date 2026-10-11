import { createHash } from 'node:crypto';
import {
  RecruitmentRuntimeDescriptorSchema,
  RecruitmentRuntimeEventSchema,
  type RecruitmentRuntimeDescriptor,
  type RecruitmentRuntimeEvent,
} from '@job-harness/recruitment-runtime-contracts';

export const BOSS_COMPAT_RUNTIME_ID = 'boss-czc-good-job';

export const BOSS_COMPAT_RUNTIME_DESCRIPTOR: RecruitmentRuntimeDescriptor = RecruitmentRuntimeDescriptorSchema.parse({
  runtimeId: BOSS_COMPAT_RUNTIME_ID,
  runtimeVersion: 'e07bf4cb663d+jh-overlay-v1',
  site: 'boss',
  implementation: 'upstream-direct',
  upstream: {
    project: 'czc-good-job',
    repository: 'https://github.com/czc6666/czc-good-job.git',
    commit: 'e07bf4cb663d9531864ca22eb6195b77e064c3b5',
    license: 'MIT',
  },
  capabilities: [
    'discovery',
    'inspect-job',
    'outreach-greeting',
    'recruiter-inbox',
    'resume-followup',
  ],
  browserProfile: 'dedicated',
  controlGranularity: 'business-task',
});

const ACTION_EVENT_TYPE = new Map<string, RecruitmentRuntimeEvent['type']>([
  ['runtime_task_accepted', 'task-accepted'],
  ['runtime_task_started', 'task-started'],
  ['runtime_task_paused', 'task-paused'],
  ['runtime_task_pause_requested', 'task-paused'],
  ['runtime_task_expired', 'task-expired'],
  ['job_observed', 'job-observed'],
  ['job_skip', 'job-skipped'],
  ['job_already_talked', 'job-skipped'],
  ['job_below_threshold', 'job-skipped'],
  ['job_hard_requirement_blocked', 'job-skipped'],
  ['greeting_requested', 'greeting-requested'],
  ['greet_sent', 'greeting-sent'],
  ['chat_greet_sent', 'greeting-sent'],
  ['recruiter_replied', 'recruiter-message-observed'],
  ['resume_sent', 'resume-sent'],
  ['outreach_persistence_failed', 'task-failed'],
]);

const EXTERNAL_EFFECT_ACTIONS = new Set(['greet_sent', 'chat_greet_sent', 'resume_sent']);

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stableEventId(row: Record<string, unknown>): string {
  const source = JSON.stringify({
    loggedAt: row.loggedAt ?? null,
    action: row.action ?? null,
    screeningSessionId: row.screeningSessionId ?? null,
    jobId: row.jobId ?? null,
    listingId: row.listingId ?? null,
    title: row.title ?? null,
    requestedProfileId: row.requestedProfileId ?? null,
  });
  return `boss-runtime-${createHash('sha256').update(source).digest('hex').slice(0, 32)}`;
}

function compactEvidence(row: Record<string, unknown>): Record<string, unknown> {
  const allow = [
    'action',
    'scene',
    'title',
    'company',
    'city',
    'jobUrl',
    'salary',
    'score',
    'threshold',
    'resumeIndex',
    'recommendedProfileId',
    'recommendedProfileLabel',
    'reason',
    'intent',
    'source',
  ] as const;
  const evidence: Record<string, unknown> = {};
  for (const key of allow) {
    const value = row[key];
    if (value !== undefined && value !== null) evidence[key] = value;
  }
  return evidence;
}

export function bossLogRowToRuntimeEvent(row: Record<string, unknown>): RecruitmentRuntimeEvent | null {
  const action = stringOrNull(row.action);
  const occurredAt = stringOrNull(row.loggedAt);
  if (!action || !occurredAt) return null;
  const type = ACTION_EVENT_TYPE.get(action);
  if (!type) return null;

  return RecruitmentRuntimeEventSchema.parse({
    eventId: stableEventId(row),
    taskId: stringOrNull(row.runtimeTaskId) ?? stringOrNull(row.screeningSessionId),
    runtimeId: BOSS_COMPAT_RUNTIME_ID,
    site: 'boss',
    type,
    occurredAt,
    jobId: stringOrNull(row.jobId),
    listingId: stringOrNull(row.listingId),
    externalEffect: EXTERNAL_EFFECT_ACTIONS.has(action),
    evidence: compactEvidence(row),
  });
}

export function projectBossRuntimeEvents(
  rows: readonly Record<string, unknown>[],
  input: { after?: string | null; limit?: number } = {},
): RecruitmentRuntimeEvent[] {
  const limit = Math.max(1, Math.min(500, input.limit ?? 100));
  const after = input.after ?? null;
  return rows
    .map(bossLogRowToRuntimeEvent)
    .filter((event): event is RecruitmentRuntimeEvent => Boolean(event))
    .filter((event) => !after || event.occurredAt > after)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
    .slice(-limit);
}

export function countBossRuntimeExternalEffects(
  rows: readonly Record<string, unknown>[],
  taskId: string,
): number {
  let count = 0;
  for (const row of rows) {
    const event = bossLogRowToRuntimeEvent(row);
    if (event?.taskId === taskId && event.externalEffect) count += 1;
  }
  return count;
}
