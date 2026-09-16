import { JobsWorkspace } from '@/components/jobs/jobs-workspace';
import type { WorkspaceSearchParams } from '@/components/jobs/query';

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<WorkspaceSearchParams>;
}) {
  return <JobsWorkspace mode="jobs" pageKey="jobs" pathname="/jobs" searchParams={await searchParams} />;
}
