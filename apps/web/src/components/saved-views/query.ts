import {
  ApplicationSavedViewDefinitionSchema,
  ApplicationStageSchema,
  JobSavedViewDefinitionSchema,
  JobSourceKindSchema,
  JobStateSchema,
  type ApplicationSavedViewDefinition,
  type JobSavedViewDefinition,
} from '@job-harness/contracts';

export type SavedViewSearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function jobSavedViewDefinitionFromParams(params: SavedViewSearchParams): JobSavedViewDefinition {
  const state = JobStateSchema.safeParse(one(params.state));
  const source = JobSourceKindSchema.safeParse(one(params.source));
  const applied = one(params.applied);
  return JobSavedViewDefinitionSchema.parse({
    ...(text(one(params.company)) ? { company: text(one(params.company)) } : {}),
    ...(text(one(params.title)) ? { title: text(one(params.title)) } : {}),
    ...(text(one(params.city)) ? { city: text(one(params.city)) } : {}),
    ...(state.success ? { state: state.data } : {}),
    ...(source.success ? { source: source.data } : {}),
    ...(applied === 'yes' ? { applied: true } : applied === 'no' ? { applied: false } : {}),
    ...(text(one(params.campaign)) ? { campaignId: text(one(params.campaign)) } : {}),
  });
}

export function applicationSavedViewDefinitionFromParams(params: SavedViewSearchParams): ApplicationSavedViewDefinition {
  const stage = ApplicationStageSchema.safeParse(one(params.stage));
  const terminal = one(params.terminal);
  const view = one(params.view);
  return ApplicationSavedViewDefinitionSchema.parse({
    ...(text(one(params.company)) ? { company: text(one(params.company)) } : {}),
    ...(stage.success ? { stage: stage.data } : {}),
    ...(text(one(params.campaign)) ? { campaignId: text(one(params.campaign)) } : {}),
    ...(text(one(params.resume)) ? { resumeProfileId: text(one(params.resume)) } : {}),
    ...(text(one(params.from)) ? { appliedFrom: text(one(params.from)) } : {}),
    ...(text(one(params.to)) ? { appliedTo: text(one(params.to)) } : {}),
    ...(terminal === 'exclude' || terminal === 'include' || terminal === 'only' ? { terminal } : {}),
    ...(view === 'board' || view === 'table' ? { view } : {}),
  });
}

export function jobsHrefFromSavedViewDefinition(definition: JobSavedViewDefinition): string {
  const query = new URLSearchParams();
  if (definition.company) query.set('company', definition.company);
  if (definition.title) query.set('title', definition.title);
  if (definition.city) query.set('city', definition.city);
  if (definition.state) query.set('state', definition.state);
  if (definition.source) query.set('source', definition.source);
  if (definition.applied !== undefined) query.set('applied', definition.applied ? 'yes' : 'no');
  if (definition.campaignId) query.set('campaign', definition.campaignId);
  const encoded = query.toString();
  return `/jobs${encoded ? `?${encoded}` : ''}`;
}

export function applicationsHrefFromSavedViewDefinition(definition: ApplicationSavedViewDefinition): string {
  const query = new URLSearchParams();
  if (definition.company) query.set('company', definition.company);
  if (definition.stage) query.set('stage', definition.stage);
  if (definition.campaignId) query.set('campaign', definition.campaignId);
  if (definition.resumeProfileId) query.set('resume', definition.resumeProfileId);
  if (definition.appliedFrom) query.set('from', definition.appliedFrom);
  if (definition.appliedTo) query.set('to', definition.appliedTo);
  if (definition.terminal) query.set('terminal', definition.terminal);
  if (definition.view) query.set('view', definition.view);
  const encoded = query.toString();
  return `/applications${encoded ? `?${encoded}` : ''}`;
}
