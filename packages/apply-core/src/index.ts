import type {
  ExecutionAttempt,
  ExecutionAttemptState,
  ExecutorRegistration,
  ExecutorStatus,
} from '@job-harness/apply-contracts';

const TERMINAL_ATTEMPT_STATES = new Set<ExecutionAttemptState>(['completed', 'failed', 'cancelled', 'abandoned']);
const ACTIVE_ATTEMPT_STATES = new Set<ExecutionAttemptState>(['queued', 'claimed', 'running', 'waiting_for_user']);

const TRANSITIONS: Readonly<Record<ExecutionAttemptState, readonly ExecutionAttemptState[]>> = {
  queued: ['claimed', 'cancelled', 'abandoned'],
  claimed: ['running', 'waiting_for_user', 'failed', 'cancelled', 'abandoned'],
  running: ['waiting_for_user', 'completed', 'failed', 'cancelled', 'abandoned'],
  waiting_for_user: ['queued', 'cancelled', 'abandoned'],
  completed: [],
  failed: [],
  cancelled: [],
  abandoned: [],
};

export function isTerminalAttemptState(state: ExecutionAttemptState): boolean {
  return TERMINAL_ATTEMPT_STATES.has(state);
}

export function isActiveAttemptState(state: ExecutionAttemptState): boolean {
  return ACTIVE_ATTEMPT_STATES.has(state);
}

export function canTransitionAttempt(from: ExecutionAttemptState, to: ExecutionAttemptState): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function canCancelAttempt(attempt: ExecutionAttempt): boolean {
  return !isTerminalAttemptState(attempt.state) && attempt.externalEffectState === 'not_crossed';
}

export function canRequeueAttempt(attempt: ExecutionAttempt): boolean {
  return attempt.state === 'waiting_for_user' && attempt.externalEffectState === 'not_crossed';
}

export function executorIsRoutable(status: ExecutorStatus): boolean {
  return status === 'ready' || status === 'busy';
}

export function executorCanRunAttempt(executor: ExecutorRegistration, attempt: ExecutionAttempt): boolean {
  if (!executorIsRoutable(executor.status)) return false;
  if (!executor.executionModes.includes(attempt.executionMode)) return false;
  if (attempt.requiredAdapterId && !executor.adapterIds.includes(attempt.requiredAdapterId)) return false;
  if (attempt.preferredBrowserBackend && !executor.browserBackends.includes(attempt.preferredBrowserBackend)) return false;
  for (const capability of attempt.requiredCapabilities) {
    if (!executor.capabilities[capability]) return false;
  }
  return true;
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
export * from './form-planner';
