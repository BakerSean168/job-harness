import { z } from 'zod';
import {
  ResolvedResumeSchema,
  ResumeLibrarySchema,
  ResumeProfileSchema,
  ResumeRevisionSchema,
  ResumeArtifactSchema,
} from './schemas';

export const ListResumeProfilesInputSchema = z.object({
  libraryId: z.string().trim().min(1).max(200).optional(),
  includeArchived: z.boolean().optional(),
}).strict();

export const ListResumeProfilesOutputSchema = z.object({
  items: z.array(ResumeProfileSchema),
  total: z.number().int().nonnegative(),
}).strict();

export const ResumeProfileContextSchema = z.object({
  library: ResumeLibrarySchema,
  profile: ResumeProfileSchema,
  resolved: ResolvedResumeSchema,
}).strict();


export const SaveResumeProfileInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  profile: ResumeProfileSchema,
}).strict();

export const SaveResumeLibraryInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  library: ResumeLibrarySchema,
}).strict();

export const ResumePreviewInputSchema = z.object({
  library: ResumeLibrarySchema,
  profile: ResumeProfileSchema,
}).strict();

export const ResumePreviewOutputSchema = z.object({
  resolved: ResolvedResumeSchema,
  html: z.string(),
}).strict();



export const MaterializeResumeArtifactInputSchema = z.object({
  revisionId: z.string().trim().min(1).max(200),
  kind: z.enum(['html', 'pdf', 'json']),
}).strict();

export const MaterializeResumeArtifactOutputSchema = z.object({
  artifact: ResumeArtifactSchema,
  reused: z.boolean(),
}).strict();

export const PublishResumeRevisionInputSchema = z.object({
  profileId: z.string().trim().min(1).max(200),
  expectedProfileVersion: z.number().int().positive(),
  expectedLibraryVersion: z.number().int().positive(),
  note: z.string().trim().max(2000).nullable().optional(),
}).strict();

export const PublishResumeRevisionOutputSchema = z.object({
  revision: ResumeRevisionSchema,
  reused: z.boolean(),
}).strict();

export const ListResumeRevisionsOutputSchema = z.object({
  items: z.array(ResumeRevisionSchema),
  total: z.number().int().nonnegative(),
}).strict();

export const ResumeRevisionDetailSchema = z.object({
  revision: ResumeRevisionSchema,
  artifacts: z.array(ResumeArtifactSchema),
}).strict();

export const ResumeRevisionDiffQuerySchema = z.object({
  against: z.enum(['previous', 'current']).optional(),
}).strict();

export const ResumeSnapshotChangeSchema = z.object({
  path: z.string(),
  kind: z.enum(['added', 'removed', 'changed']),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
}).strict();

export const ResumeRevisionDiffOutputSchema = z.object({
  profileId: z.string().trim().min(1).max(200),
  against: z.enum(['previous', 'current']),
  fromRevisionId: z.string().trim().min(1).max(200).nullable(),
  toRevisionId: z.string().trim().min(1).max(200).nullable(),
  fromContentHash: z.string().regex(/^[a-f0-9]{64}$/i).nullable(),
  toContentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  changes: z.array(ResumeSnapshotChangeSchema),
}).strict();

export type ListResumeProfilesInput = z.infer<typeof ListResumeProfilesInputSchema>;
export type ListResumeProfilesOutput = z.infer<typeof ListResumeProfilesOutputSchema>;
export type ResumeProfileContext = z.infer<typeof ResumeProfileContextSchema>;
export type SaveResumeProfileInput = z.infer<typeof SaveResumeProfileInputSchema>;
export type SaveResumeLibraryInput = z.infer<typeof SaveResumeLibraryInputSchema>;
export type ResumePreviewInput = z.infer<typeof ResumePreviewInputSchema>;
export type ResumePreviewOutput = z.infer<typeof ResumePreviewOutputSchema>;
export type PublishResumeRevisionInput = z.infer<typeof PublishResumeRevisionInputSchema>;
export type PublishResumeRevisionOutput = z.infer<typeof PublishResumeRevisionOutputSchema>;
export type ListResumeRevisionsOutput = z.infer<typeof ListResumeRevisionsOutputSchema>;
export type ResumeRevisionDetail = z.infer<typeof ResumeRevisionDetailSchema>;
export type ResumeRevisionDiffQuery = z.infer<typeof ResumeRevisionDiffQuerySchema>;
export type ResumeRevisionDiffOutput = z.infer<typeof ResumeRevisionDiffOutputSchema>;
export type ResumeSnapshotChange = z.infer<typeof ResumeSnapshotChangeSchema>;
export type MaterializeResumeArtifactInput = z.infer<typeof MaterializeResumeArtifactInputSchema>;
export type MaterializeResumeArtifactOutput = z.infer<typeof MaterializeResumeArtifactOutputSchema>;
