import { JobsWorkspace } from '@/components/jobs/jobs-workspace';
import type { WorkspaceSearchParams } from '@/components/jobs/query';

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<WorkspaceSearchParams>;
}) {
  return <JobsWorkspace mode="inbox" pageKey="inbox" pathname="/inbox" searchParams={await searchParams} />;
}
