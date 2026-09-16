export const JOB_STATES = ['discovered', 'shortlisted', 'ignored', 'closed', 'archived'] as const;
export type JobState = (typeof JOB_STATES)[number];

export const APPLICATION_STAGES = [
  'applied',
  'screening',
  'assessment',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export const APPLICATION_EVENT_TYPES = [
  'application_recorded',
  'stage_changed',
  'interview_scheduled',
  'note_added',
] as const;
export type ApplicationEventType = (typeof APPLICATION_EVENT_TYPES)[number];

export const CAMPAIGN_STATUSES = ['active', 'paused', 'completed', 'archived'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const DISCOVERY_EXECUTORS = [
  'chatgpt-web',
  'memoflow-ai',
  'import',
  'manual',
  'other',
] as const;
export type DiscoveryExecutor = (typeof DISCOVERY_EXECUTORS)[number];

export const JOB_SOURCE_KINDS = [
  'official',
  'boss',
  'zhilian',
  'liepin',
  'moka',
  'greenhouse',
  'lever',
  'ashby',
  'email',
  'manual',
  'other',
] as const;
export type JobSourceKind = (typeof JOB_SOURCE_KINDS)[number];

export const EVENT_ACTORS = ['user', 'chatgpt-web', 'import', 'system', 'other'] as const;
export type EventActor = (typeof EVENT_ACTORS)[number];
