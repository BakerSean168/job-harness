import type { JobDetail, SiteResumeBinding, SubmissionIntent } from '@job-harness/contracts';

export interface AtsBindingTarget {
  readonly intentId: string;
  readonly jobId: string;
  readonly siteFamily: 'zhilian' | 'liepin';
  readonly targetUrl: string;
  readonly profileId: string;
  readonly resumeRevisionId: string;
  readonly resumeArtifactId: string;
  readonly title: string;
  readonly companyName: string;
}

export function managedSiteIntentRoute(intent: SubmissionIntent): { siteFamily: 'zhilian' | 'liepin'; targetUrl: string } | null {
  if (!intent.externalTargetUrl) return null;
  let url: URL;
  try { url = new URL(intent.externalTargetUrl); } catch { return null; }
  const host = url.hostname.toLowerCase();
  if ((host === 'zhaopin.com' || host === 'www.zhaopin.com') && /^\/jobdetail\/[^/]+\.htm$/i.test(url.pathname)) {
    url.search = ''; url.hash = '';
    return { siteFamily: 'zhilian', targetUrl: url.toString() };
  }
  if ((host === 'liepin.com' || host === 'www.liepin.com') && /^\/job\/\d+\.shtml$/i.test(url.pathname)) {
    url.search = ''; url.hash = '';
    return { siteFamily: 'liepin', targetUrl: url.toString() };
  }
  return null;
}

export function exactSiteResumeBindingExists(
  intent: SubmissionIntent,
  route: { siteFamily: 'zhilian' | 'liepin' },
  bindings: readonly SiteResumeBinding[],
): boolean {
  if (!intent.resumeProfileId || !intent.resumeRevisionId || !intent.resumeArtifactId) return false;
  return bindings.some((binding) => binding.status === 'active'
    && binding.siteFamily === route.siteFamily
    && binding.profileId === intent.resumeProfileId
    && binding.resumeRevisionId === intent.resumeRevisionId
    && binding.resumeArtifactId === intent.resumeArtifactId);
}

export function makeAtsBindingTarget(
  intent: SubmissionIntent,
  detail: JobDetail,
): AtsBindingTarget | null {
  const route = managedSiteIntentRoute(intent);
  if (!route || !intent.resumeProfileId || !intent.resumeRevisionId || !intent.resumeArtifactId) return null;
  return {
    intentId: intent.id,
    jobId: intent.jobId,
    siteFamily: route.siteFamily,
    targetUrl: route.targetUrl,
    profileId: intent.resumeProfileId,
    resumeRevisionId: intent.resumeRevisionId,
    resumeArtifactId: intent.resumeArtifactId,
    title: detail.job.title,
    companyName: detail.job.companyName,
  };
}

export function sameManagedJob(left: string, right: string): boolean {
  try {
    const a = new URL(left); const b = new URL(right);
    return a.hostname.toLowerCase() === b.hostname.toLowerCase() && a.pathname === b.pathname;
  } catch { return false; }
}
