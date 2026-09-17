import { z } from 'zod';
import {
  ApplicationEventSchema,
  ApplicationSubmissionSchema,
  ApplicationSchema,
  CompanySchema,
  DiscoveryRunSchema,
  IsoDateTimeSchema,
  JobObservationSchema,
  JobSchema,
  JobSearchCampaignSchema,
  ResumeProfileRefSchema,
} from './schemas';

export const CareerExportApplicationSchema = z.object({
  application: ApplicationSchema,
  timeline: z.array(ApplicationEventSchema),
  submissions: z.array(ApplicationSubmissionSchema),
}).strict();

export const CareerExportSnapshotSchema = z.object({
  format: z.literal('job-harness-career-export'),
  schemaVersion: z.literal(2),
  exportedAt: IsoDateTimeSchema,
  companies: z.array(CompanySchema),
  jobs: z.array(JobSchema),
  observations: z.array(JobObservationSchema),
  applications: z.array(CareerExportApplicationSchema),
  campaigns: z.array(JobSearchCampaignSchema),
  resumes: z.array(ResumeProfileRefSchema),
  discoveryRuns: z.array(DiscoveryRunSchema),
}).strict();

export type CareerExportApplication = z.infer<typeof CareerExportApplicationSchema>;
export type CareerExportSnapshot = z.infer<typeof CareerExportSnapshotSchema>;
