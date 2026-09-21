import { z } from 'zod';
import {
  RecruitmentRuntimeDescriptorSchema,
  type RecruitmentRuntimeDescriptor,
} from '@job-harness/recruitment-runtime-contracts';

export const GET_JOBS_UPSTREAM_COMMIT = 'ec3c81c3bf3c09d155cb7f76604e6fca2567612c';
export const GET_JOBS_UPSTREAM_REPOSITORY = 'https://github.com/vvvsrx/get_jobs.git';
export const GET_JOBS_RUNTIME_VERSION = `${GET_JOBS_UPSTREAM_COMMIT.slice(0, 12)}+jh-collect-overlay-v1`;

export const GetJobsRuntimeSiteSchema = z.enum(['zhilian', 'liepin', 'job51']);
export type GetJobsRuntimeSite = z.infer<typeof GetJobsRuntimeSiteSchema>;

export const SITE_LABELS: Readonly<Record<GetJobsRuntimeSite, string>> = Object.freeze({
  zhilian: '智联招聘',
  liepin: '猎聘',
  job51: '51job',
});

export const SITE_BASE_URLS: Readonly<Record<GetJobsRuntimeSite, string>> = Object.freeze({
  zhilian: 'https://www.zhaopin.com/',
  liepin: 'https://www.liepin.com/',
  job51: 'https://we.51job.com/',
});

export const StatusSchema = z.object({
  running: z.boolean(),
  current: z.string().nullable().optional(),
  total: z.unknown().nullable().optional(),
  platform: z.string().nullable().optional(),
  delivered_count: z.number().int().nonnegative().default(0),
  filtered_count: z.number().int().nonnegative().default(0),
}).passthrough();

export const LoginStatusSchema = z.object({
  success: z.boolean(),
  isLoggedIn: z.boolean(),
  message: z.string().optional(),
}).passthrough();

export const RuntimeInfoSchema = z.object({
  integration: z.literal('job-harness'),
  collectOnly: z.boolean(),
  mode: z.enum(['collect-only', 'upstream-default']),
}).passthrough();

export const ActionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  status: z.string().nullable().optional(),
}).passthrough();

const RuntimeConfigOptionSchema = z.object({
  type: z.string().optional(),
  name: z.string(),
  code: z.string(),
}).passthrough();

export const RuntimeConfigResponseSchema = z.object({
  success: z.boolean(),
  config: z.record(z.string(), z.unknown()),
  options: z.record(z.string(), z.array(RuntimeConfigOptionSchema)),
}).passthrough();

const CommonRowSchema = z.object({
  id: z.number().int().nonnegative(),
  job_id: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  job_link: z.string().nullable().optional(),
  delivered: z.number().int().nullable().optional(),
  created_at: z.string().nullable().optional(),
}).passthrough();

const ZhilianRowSchema = CommonRowSchema.extend({
  salary: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  experience: z.string().nullable().optional(),
  degree: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  company_tag: z.string().nullable().optional(),
}).passthrough();

const LiepinRowSchema = CommonRowSchema.extend({
  job_salary_text: z.string().nullable().optional(),
  job_area: z.string().nullable().optional(),
  job_edu_req: z.string().nullable().optional(),
  job_exp_req: z.string().nullable().optional(),
  job_publish_time: z.string().nullable().optional(),
  comp_id: z.string().nullable().optional(),
  comp_name: z.string().nullable().optional(),
  comp_industry: z.string().nullable().optional(),
  comp_scale: z.string().nullable().optional(),
  hr_id: z.string().nullable().optional(),
  hr_name: z.string().nullable().optional(),
  hr_title: z.string().nullable().optional(),
}).passthrough();

const Job51RowSchema = LiepinRowSchema;

export const ListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(z.record(z.string(), z.unknown())),
  total: z.number().int().nonnegative(),
}).passthrough();

export type GetJobsRuntimeRow =
  | z.infer<typeof ZhilianRowSchema>
  | z.infer<typeof LiepinRowSchema>
  | z.infer<typeof Job51RowSchema>;

export function parseGetJobsRuntimeRow(
  site: GetJobsRuntimeSite,
  raw: Record<string, unknown>,
): GetJobsRuntimeRow {
  if (site === 'zhilian') return ZhilianRowSchema.parse(raw);
  if (site === 'liepin') return LiepinRowSchema.parse(raw);
  return Job51RowSchema.parse(raw);
}

function descriptor(site: GetJobsRuntimeSite): RecruitmentRuntimeDescriptor {
  return RecruitmentRuntimeDescriptorSchema.parse({
    runtimeId: `get-jobs-${site}`,
    runtimeVersion: GET_JOBS_RUNTIME_VERSION,
    site,
    implementation: 'upstream-direct',
    upstream: {
      project: 'vvvsrx-get-jobs',
      repository: GET_JOBS_UPSTREAM_REPOSITORY,
      commit: GET_JOBS_UPSTREAM_COMMIT,
      license: 'MIT',
    },
    capabilities: ['discovery', 'inspect-job'],
    browserProfile: 'dedicated',
    controlGranularity: 'business-task',
  });
}

export const GET_JOBS_RUNTIME_DESCRIPTORS = Object.freeze({
  zhilian: descriptor('zhilian'),
  liepin: descriptor('liepin'),
  job51: descriptor('job51'),
});
