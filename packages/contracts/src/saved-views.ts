import { z } from 'zod';
import {
  ApplicationStageSchema,
  EntityIdSchema,
  IsoDateTimeSchema,
  JobSourceKindSchema,
  JobStateSchema,
} from './schemas';
import { PageSchema } from './operations';

export const SavedViewWorkspaceSchema = z.enum(['jobs', 'applications']);

export const JobSavedViewDefinitionSchema = z.object({
  company: z.string().trim().min(1).max(300).optional(),
  title: z.string().trim().min(1).max(500).optional(),
  city: z.string().trim().min(1).max(200).optional(),
  state: JobStateSchema.optional(),
  source: JobSourceKindSchema.optional(),
  applied: z.boolean().optional(),
  campaignId: EntityIdSchema.optional(),
}).strict();

const DateFilterSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const ApplicationSavedViewDefinitionSchema = z.object({
  company: z.string().trim().min(1).max(300).optional(),
  stage: ApplicationStageSchema.optional(),
  campaignId: EntityIdSchema.optional(),
  resumeProfileId: EntityIdSchema.optional(),
  appliedFrom: DateFilterSchema.optional(),
  appliedTo: DateFilterSchema.optional(),
  terminal: z.enum(['exclude', 'include', 'only']).optional(),
  view: z.enum(['board', 'table']).optional(),
}).strict();

const SavedViewBaseSchema = z.object({
  id: EntityIdSchema,
  name: z.string().trim().min(1).max(120),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const JobSavedViewSchema = SavedViewBaseSchema.extend({
  workspace: z.literal('jobs'),
  definition: JobSavedViewDefinitionSchema,
}).strict();
export const ApplicationSavedViewSchema = SavedViewBaseSchema.extend({
  workspace: z.literal('applications'),
  definition: ApplicationSavedViewDefinitionSchema,
}).strict();
export const SavedViewSchema = z.discriminatedUnion('workspace', [JobSavedViewSchema, ApplicationSavedViewSchema]);

export const UpsertJobSavedViewInputSchema = JobSavedViewSchema.omit({ createdAt: true, updatedAt: true });
export const UpsertApplicationSavedViewInputSchema = ApplicationSavedViewSchema.omit({ createdAt: true, updatedAt: true });
export const UpsertSavedViewInputSchema = z.discriminatedUnion('workspace', [
  UpsertJobSavedViewInputSchema,
  UpsertApplicationSavedViewInputSchema,
]);

export const ListSavedViewsInputSchema = PageSchema.extend({
  workspace: SavedViewWorkspaceSchema.optional(),
});
export const ListSavedViewsOutputSchema = z.object({
  items: z.array(SavedViewSchema),
  total: z.number().int().nonnegative(),
}).strict();

export type SavedViewWorkspace = z.infer<typeof SavedViewWorkspaceSchema>;
export type JobSavedViewDefinition = z.infer<typeof JobSavedViewDefinitionSchema>;
export type ApplicationSavedViewDefinition = z.infer<typeof ApplicationSavedViewDefinitionSchema>;
export type SavedView = z.infer<typeof SavedViewSchema>;
export type UpsertSavedViewInput = z.input<typeof UpsertSavedViewInputSchema>;
export type ListSavedViewsInput = z.input<typeof ListSavedViewsInputSchema>;
export type ListSavedViewsOutput = z.output<typeof ListSavedViewsOutputSchema>;
