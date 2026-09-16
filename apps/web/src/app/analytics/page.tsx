import { AnalyticsWorkspace } from '@/components/management/analytics-workspace';
import type { ManagementSearchParams } from '@/components/management/campaigns-workspace';
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<ManagementSearchParams> }) { return <AnalyticsWorkspace searchParams={await searchParams} />; }
