import { describe, expect, it, vi } from 'vitest';
import type { CareerApplicationPorts } from '@job-harness/application';
import { createCareerMcpRuntime, UnknownCareerMcpToolError } from '../src';

function fakePorts(): CareerApplicationPorts {
  return {
    jobs: {
      searchJobs: vi.fn(async () => ({ items: [], total: 0 })),
      getJob: vi.fn(async () => null),
      checkDuplicate: vi.fn(async () => ({ duplicate: false, job: null, matchedBy: null })),
      upsertJobsBatch: vi.fn(async (input) => ({
        items: input.jobs.map((_, index) => ({ index, status: 'inserted' as const, jobId: `job-${index}`, reason: null })),
      })),
      setJobState: vi.fn(),
    },
    applications: {
      listApplications: vi.fn(async () => ({ items: [], total: 0 })),
      getApplication: vi.fn(async () => null),
      recordApplication: vi.fn(),
      transitionApplication: vi.fn(),
    },
    campaigns: {
      listCampaigns: vi.fn(async () => ({ items: [], total: 0 })),
      getCampaign: vi.fn(async () => null),
      upsertCampaign: vi.fn(),
    },
    discovery: {
      beginDiscoveryRun: vi.fn(),
      completeDiscoveryRun: vi.fn(),
    },
    resumes: {
      listResumeProfiles: vi.fn(async () => ({ items: [], total: 0 })),
    },
    analytics: {
      getPipelineStats: vi.fn(async () => ({
        knownJobs: 0,
        applications: 0,
        jobsByState: { discovered: 0, shortlisted: 0, ignored: 0, closed: 0, archived: 0 },
        applicationsByStage: { applied: 0, screening: 0, assessment: 0, interview: 0, offer: 0, rejected: 0, withdrawn: 0 },
      })),
      getCareerContext: vi.fn(async () => ({
        campaign: null,
        resumes: [],
        pipeline: {
          knownJobs: 0,
          applications: 0,
          jobsByState: { discovered: 0, shortlisted: 0, ignored: 0, closed: 0, archived: 0 },
          applicationsByStage: { applied: 0, screening: 0, assessment: 0, interview: 0, offer: 0, rejected: 0, withdrawn: 0 },
        },
      })),
    },
  };
}

describe('CareerMcpRuntime', () => {
  it('dispatches validated read tools only through application ports', async () => {
    const ports = fakePorts();
    const runtime = createCareerMcpRuntime(ports);
    const result = await runtime.invoke('career_jobs_search', { limit: 10, offset: 0, company: 'Acme' });
    expect(result).toEqual({ items: [], total: 0 });
    expect(ports.jobs.searchJobs).toHaveBeenCalledWith({ limit: 10, offset: 0, company: 'Acme' });
  });

  it('rejects invalid input before invoking a port', async () => {
    const ports = fakePorts();
    const runtime = createCareerMcpRuntime(ports);
    await expect(runtime.invoke('career_jobs_upsert_batch', { jobs: [] })).rejects.toThrow();
    expect(ports.jobs.upsertJobsBatch).not.toHaveBeenCalled();
  });

  it('rejects unknown tools', async () => {
    const runtime = createCareerMcpRuntime(fakePorts());
    await expect(runtime.invoke('career_database_raw_sql', {})).rejects.toBeInstanceOf(UnknownCareerMcpToolError);
  });
});
