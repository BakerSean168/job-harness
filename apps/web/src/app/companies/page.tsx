import { CompaniesWorkspace } from '@/components/management/companies-workspace';
import type { ManagementSearchParams } from '@/components/management/campaigns-workspace';
export default async function CompaniesPage({ searchParams }: { searchParams: Promise<ManagementSearchParams> }) { return <CompaniesWorkspace searchParams={await searchParams} />; }
