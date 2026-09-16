import { ResumesWorkspace } from '@/components/management/resumes-workspace';
import type { ManagementSearchParams } from '@/components/management/campaigns-workspace';

export default async function ResumesPage({ searchParams }: { searchParams: Promise<ManagementSearchParams> }) {
  return <ResumesWorkspace searchParams={await searchParams} />;
}
