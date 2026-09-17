export const JOB_STATES = ['discovered', 'shortlisted', 'ignored', 'closed', 'archived'] as const;
export type JobState = (typeof JOB_STATES)[number];

export const JOB_LISTING_STATUSES = ['active', 'closed', 'unknown'] as const;
export type JobListingStatus = (typeof JOB_LISTING_STATUSES)[number];

export const JOB_LISTING_IDENTITY_KINDS = ['external-id', 'url', 'scoped'] as const;
export type JobListingIdentityKind = (typeof JOB_LISTING_IDENTITY_KINDS)[number];

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
  'submission_recorded',
  'stage_changed',
  'interview_scheduled',
  'note_added',
] as const;
export type ApplicationEventType = (typeof APPLICATION_EVENT_TYPES)[number];


export const APPLICATION_SUBMISSION_CHANNELS = [
  'official',
  'boss',
  'zhilian',
  'liepin',
  'moka',
  'greenhouse',
  'lever',
  'ashby',
  'email',
  'referral',
  'manual',
  'other',
] as const;
export type ApplicationSubmissionChannel = (typeof APPLICATION_SUBMISSION_CHANNELS)[number];

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


export const SUBMISSION_INTENT_STATUSES = [
  'planned',
  'external_in_progress',
  'external_confirmed',
  'persistence_pending',
  'committed',
  'external_failed',
  'needs_manual_review',
] as const;
export type SubmissionIntentStatus = (typeof SUBMISSION_INTENT_STATUSES)[number];

export const SUBMISSION_INTENT_EXECUTORS = [
  'chatgpt-web',
  'job-honey',
  'browser-extension',
  'manual',
  'other',
] as const;
export type SubmissionIntentExecutor = (typeof SUBMISSION_INTENT_EXECUTORS)[number];
