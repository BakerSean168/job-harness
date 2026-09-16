import type { ApplicationStage, JobState } from './vocabulary';

const JOB_TRANSITIONS: Readonly<Record<JobState, readonly JobState[]>> = {
  discovered: ['shortlisted', 'ignored', 'closed', 'archived'],
  shortlisted: ['discovered', 'ignored', 'closed', 'archived'],
  ignored: ['discovered', 'shortlisted', 'archived'],
  closed: ['discovered', 'archived'],
  archived: ['discovered'],
};

const APPLICATION_TRANSITIONS: Readonly<Record<ApplicationStage, readonly ApplicationStage[]>> = {
  applied: ['screening', 'assessment', 'interview', 'offer', 'rejected', 'withdrawn'],
  screening: ['assessment', 'interview', 'offer', 'rejected', 'withdrawn'],
  assessment: ['interview', 'offer', 'rejected', 'withdrawn'],
  interview: ['interview', 'offer', 'rejected', 'withdrawn'],
  offer: [],
  rejected: [],
  withdrawn: [],
};

export function canTransitionJobState(from: JobState, to: JobState): boolean {
  return from === to || JOB_TRANSITIONS[from].includes(to);
}

export function canTransitionApplicationStage(
  from: ApplicationStage,
  to: ApplicationStage,
): boolean {
  return from === to || APPLICATION_TRANSITIONS[from].includes(to);
}
