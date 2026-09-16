import { ApplicationsWorkspace } from '@/components/applications/applications-workspace';
import type { ApplicationsSearchParams } from '@/components/applications/query';

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<ApplicationsSearchParams>;
}) {
  return <ApplicationsWorkspace searchParams={await searchParams} />;
}
