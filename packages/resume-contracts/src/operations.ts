import { z } from 'zod';
import {
  ResolvedResumeSchema,
  ResumeLibrarySchema,
  ResumeProfileSchema,
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

export const ResumePreviewInputSchema = z.object({
  library: ResumeLibrarySchema,
  profile: ResumeProfileSchema,
}).strict();

export const ResumePreviewOutputSchema = z.object({
  resolved: ResolvedResumeSchema,
  html: z.string(),
}).strict();

export type ListResumeProfilesInput = z.infer<typeof ListResumeProfilesInputSchema>;
export type ListResumeProfilesOutput = z.infer<typeof ListResumeProfilesOutputSchema>;
export type ResumeProfileContext = z.infer<typeof ResumeProfileContextSchema>;
export type ResumePreviewInput = z.infer<typeof ResumePreviewInputSchema>;
export type ResumePreviewOutput = z.infer<typeof ResumePreviewOutputSchema>;
