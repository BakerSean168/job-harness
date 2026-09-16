import { CampaignsWorkspace, type ManagementSearchParams } from '@/components/management/campaigns-workspace';

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<ManagementSearchParams> }) {
  return <CampaignsWorkspace searchParams={await searchParams} />;
}
