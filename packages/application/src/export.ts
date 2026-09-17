import {
  CareerExportSnapshotSchema,
  type CareerExportApplication,
  type CareerExportSnapshot,
  type Company,
  type DiscoveryRun,
  type Job,
  type JobObservation,
  type JobSearchCampaign,
  type ResumeProfileRef,
  type SubmissionIntent,
} from '@job-harness/contracts';
import type { CareerRuntimePorts } from './ports';

interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

async function collectPages<T>(
  load: (limit: number, offset: number) => Promise<Page<T>>,
): Promise<T[]> {
  const limit = 200;
  const items: T[] = [];
  for (let offset = 0; ; offset += limit) {
    const page = await load(limit, offset);
    items.push(...page.items);
    if (items.length >= page.total || page.items.length === 0) return items;
  }
}

function byId<T extends { readonly id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}

export async function buildCareerExportSnapshot(
  career: CareerRuntimePorts,
  exportedAt: string,
): Promise<CareerExportSnapshot> {
  const [companyViews, jobItems, applicationItems, campaigns, resumes, discoverySummaries, submissionIntents] = await Promise.all([
    collectPages((limit, offset) => career.workspace.listCompanies({ limit, offset })),
    collectPages((limit, offset) => career.workspace.searchJobListItems({ limit, offset })),
    collectPages((limit, offset) => career.workspace.listApplicationBoard({ limit, offset, terminal: 'include' })),
    collectPages((limit, offset) => career.campaigns.listCampaigns({ limit, offset })),
    collectPages((limit, offset) => career.resumes.listResumeProfiles({ limit, offset })),
    collectPages((limit, offset) => career.workspace.listDiscoveryRuns({ limit, offset })),
    collectPages((limit, offset) => career.submissionIntents.list({ limit, offset })),
  ]);

  const companies: Company[] = companyViews.map((item) => item.company).sort(byId);
  const jobs: Job[] = [];
  const observations: JobObservation[] = [];
  for (const item of jobItems) {
    const detail = await career.workspace.getJobDetail(item.jobId);
    if (!detail) throw new Error(`Job '${item.jobId}' disappeared while exporting a stable snapshot`);
    jobs.push(detail.job);
    observations.push(...detail.observations.map((entry) => entry.observation));
  }

  const applications: CareerExportApplication[] = [];
  for (const item of applicationItems) {
    const detail = await career.workspace.getApplicationWorkspaceDetail(item.application.id);
    if (!detail) throw new Error(`Application '${item.application.id}' disappeared while exporting a stable snapshot`);
    applications.push({ application: detail.application, timeline: detail.timeline, submissions: detail.submissions });
  }

  const campaignRows: JobSearchCampaign[] = [...campaigns].sort(byId);
  const resumeRows: ResumeProfileRef[] = [...resumes].sort(byId);
  const discoveryRuns: DiscoveryRun[] = discoverySummaries.map((entry) => entry.run).sort(byId);
  const submissionIntentRows: SubmissionIntent[] = [...submissionIntents].sort(byId);

  return CareerExportSnapshotSchema.parse({
    format: 'job-harness-career-export',
    schemaVersion: 3,
    exportedAt,
    companies,
    jobs: jobs.sort(byId),
    observations: observations.sort(byId),
    applications: applications.sort((left, right) => left.application.id.localeCompare(right.application.id)),
    campaigns: campaignRows,
    resumes: resumeRows,
    discoveryRuns,
    submissionIntents: submissionIntentRows,
  });
}
