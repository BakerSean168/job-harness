import { JobSourceKindSchema, JobStateSchema, type SearchJobListItemsInput } from '@job-harness/contracts';
import type { PageKey } from '@/i18n';
import { getLocale, getMessages } from '@/i18n/server';
import { getJobHarnessClient } from '@/lib/job-harness-client';
import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { JobsFilters } from './jobs-filters';
import { JobsPagination } from './jobs-pagination';
import { JobsTable } from './jobs-table';
import { JobSidePanel } from './job-side-panel';
import { one, positiveInteger, workspaceHref, type WorkspaceSearchParams } from './query';

const PAGE_SIZE = 50;

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export async function JobsWorkspace({
  mode,
  pageKey,
  pathname,
  searchParams,
}: {
  mode: 'jobs' | 'inbox';
  pageKey: Extract<PageKey, 'jobs' | 'inbox'>;
  pathname: '/jobs' | '/inbox';
  searchParams: WorkspaceSearchParams;
}) {
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  const offset = positiveInteger(searchParams.offset, 0);
  const stateRaw = optional(one(searchParams.state));
  const sourceRaw = optional(one(searchParams.source));
  const state = stateRaw ? JobStateSchema.safeParse(stateRaw) : null;
  const source = sourceRaw ? JobSourceKindSchema.safeParse(sourceRaw) : null;
  const appliedRaw = one(searchParams.applied);

  const input: SearchJobListItemsInput = {
    limit: PAGE_SIZE,
    offset,
    ...(optional(one(searchParams.title)) ? { title: optional(one(searchParams.title)) } : {}),
    ...(optional(one(searchParams.company)) ? { company: optional(one(searchParams.company)) } : {}),
    ...(optional(one(searchParams.city)) ? { city: optional(one(searchParams.city)) } : {}),
    ...(mode === 'inbox'
      ? { states: ['discovered'] }
      : state?.success ? { states: [state.data] } : {}),
    ...(source?.success ? { sourceKinds: [source.data] } : {}),
    ...(appliedRaw === 'yes' ? { applied: true } : appliedRaw === 'no' ? { applied: false } : {}),
  };

  const client = getJobHarnessClient();
  const selectedJobId = optional(one(searchParams.job));
  const [page, selectedDetail] = await Promise.all([
    client.workspace.searchJobListItems(input),
    selectedJobId ? client.workspace.getJobDetail(selectedJobId) : Promise.resolve(null),
  ]);
  const closeHref = workspaceHref(pathname, searchParams, { job: null });

  return (
    <div className="workspace-page jobs-workspace-page">
      <WorkspaceHeader
        title={messages.pages[pageKey].title}
        description={messages.pages[pageKey].description}
        actions={<span className="workspace-result-count">{page.total} {messages.jobsWorkspace.table.results}</span>}
      />
      <div className="workspace-surface jobs-surface">
        <JobsFilters mode={mode} pathname={pathname} params={searchParams} messages={messages} />
        <JobsTable
          items={page.items}
          pathname={pathname}
          params={searchParams}
          {...(selectedJobId ? { selectedJobId } : {})}
          locale={locale}
          messages={messages}
        />
        <JobsPagination
          pathname={pathname}
          params={searchParams}
          offset={offset}
          limit={PAGE_SIZE}
          total={page.total}
          messages={messages}
        />
      </div>
      {selectedDetail ? (
        <JobSidePanel
          detail={selectedDetail}
          closeHref={closeHref}
          closeAfterMutation={mode === 'inbox'}
          locale={locale}
          messages={messages}
        />
      ) : null}
    </div>
  );
}
