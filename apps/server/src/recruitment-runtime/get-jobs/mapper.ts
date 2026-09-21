import type { UpsertJobCandidate } from '@job-harness/contracts';
import {
  GET_JOBS_UPSTREAM_COMMIT,
  SITE_BASE_URLS,
  SITE_LABELS,
  type GetJobsRuntimeSite,
  parseGetJobsRuntimeRow,
} from './model';

export interface GetJobsRuntimeImportInput {
  readonly observedAt?: string;
  readonly discoveryRunId?: string | null;
}

function text(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, max) : null;
}

export function normalizeGetJobsListingUrl(site: GetJobsRuntimeSite, value: unknown): string | null {
  const raw = text(value, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw, SITE_BASE_URLS[site]);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    if (site === 'zhilian' && /(^|\.)zhaopin\.com$/i.test(url.hostname) && /\/jobdetail\/[^/]+\.htm$/i.test(url.pathname)) {
      url.search = '';
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function stableZhilianExternalId(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/jobdetail\/([^/?#]+?)\.htm$/i);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function getJobsRuntimeRowToCandidate(
  site: GetJobsRuntimeSite,
  raw: Record<string, unknown>,
  input: GetJobsRuntimeImportInput = {},
): UpsertJobCandidate | null {
  const row = parseGetJobsRuntimeRow(site, raw) as Record<string, unknown>;
  const title = text(row.job_title, 500);
  const companyName = text(site === 'zhilian' ? row.company_name : row.comp_name, 300);
  if (!title || !companyName) return null;

  const url = normalizeGetJobsListingUrl(site, row.job_link);
  const externalId = site === 'zhilian'
    ? stableZhilianExternalId(url)
    : text(row.job_id, 300);
  if (!externalId && !url) return null;

  const city = text(site === 'zhilian' ? row.location : row.job_area, 200);
  const salary = text(site === 'zhilian' ? row.salary : row.job_salary_text, 200);
  const experience = text(site === 'zhilian' ? row.experience : row.job_exp_req, 200);
  const education = text(site === 'zhilian' ? row.degree : row.job_edu_req, 200);
  const observedAt = input.observedAt ?? new Date().toISOString();
  const upstreamCreatedAt = text(row.created_at, 100);

  const metadataSnapshot: Record<string, unknown> = {
    source: 'vvvsrx-get-jobs',
    upstreamProject: 'vvvsrx/get_jobs',
    upstreamCommit: GET_JOBS_UPSTREAM_COMMIT,
    collectOnlyOverlay: true,
    upstreamRowId: row.id,
    upstreamDelivered: row.delivered === 1,
  };
  if (salary) metadataSnapshot.salary = salary;
  if (experience) metadataSnapshot.experience = experience;
  if (education) metadataSnapshot.education = education;
  if (upstreamCreatedAt) metadataSnapshot.upstreamCreatedAt = upstreamCreatedAt;

  if (site !== 'zhilian') {
    for (const key of ['job_publish_time', 'comp_id', 'comp_industry', 'comp_scale', 'hr_id', 'hr_name', 'hr_title'] as const) {
      const value = text(row[key], 300);
      if (value) metadataSnapshot[key] = value;
    }
  } else {
    const companyTag = text(row.company_tag, 300);
    if (companyTag) metadataSnapshot.companyTag = companyTag;
  }

  return {
    companyName,
    title,
    ...(city ? { city } : {}),
    observedAt,
    ...(input.discoveryRunId ? { discoveryRunId: input.discoveryRunId } : {}),
    listings: [{
      sourceKind: site,
      label: SITE_LABELS[site],
      ...(url ? { url } : {}),
      ...(externalId ? {
        externalNamespace: site,
        externalId,
        identityKind: 'external-id' as const,
      } : {
        identityKind: 'url' as const,
      }),
      status: 'active',
      metadataSnapshot,
    }],
  };
}
