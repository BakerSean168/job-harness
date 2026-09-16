import { DashboardWorkspace, type DashboardSearchParams } from '@/components/dashboard/dashboard-workspace';

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  return <DashboardWorkspace searchParams={await searchParams} />;
}
