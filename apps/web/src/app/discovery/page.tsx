import { DiscoveryWorkspace } from '@/components/management/discovery-workspace';
import type { ManagementSearchParams } from '@/components/management/campaigns-workspace';

export default async function DiscoveryPage({ searchParams }: { searchParams: Promise<ManagementSearchParams> }) {
  return <DiscoveryWorkspace searchParams={await searchParams} />;
}
