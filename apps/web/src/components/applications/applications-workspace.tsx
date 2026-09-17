import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { ApplicationStageSchema, type ListApplicationBoardInput, type ListApplicationBoardOutput } from '@job-harness/contracts';
import type { ApplicationStage } from '@job-harness/domain';
import { getLocale, getMessages } from '@/i18n/server';
import { getJobHarnessClient } from '@/lib/job-harness-client';
import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { SavedViewsBar } from '@/components/saved-views/saved-views-bar';
import { applicationSavedViewDefinitionFromParams } from '@/components/saved-views/query';
import { ApplicationsFilters } from './applications-filters';
import { ApplicationsBoard } from './applications-board';
import { ApplicationsTable } from './applications-table';
import { ApplicationsPagination } from './applications-pagination';
import { ApplicationSidePanel } from './application-side-panel';
import {
  applicationsHref,
  dateEnd,
  dateStart,
  nonNegativeInteger,
  one,
  type ApplicationsSearchParams,
} from './query';

const TABLE_PAGE_SIZE = 50;
const BOARD_LANE_PAGE_SIZE = 40;
const MAIN_STAGES: readonly ApplicationStage[] = ['applied', 'screening', 'assessment', 'interview', 'offer'];
const OUTCOME_STAGES: readonly ApplicationStage[] = ['rejected', 'withdrawn'];

type TerminalMode = 'exclude' | 'include' | 'only';

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function terminalMode(raw: string | undefined, stage: string | undefined): TerminalMode {
  const parsed = raw === 'include' || raw === 'only' || raw === 'exclude' ? raw : 'exclude';
  if ((stage === 'rejected' || stage === 'withdrawn') && parsed === 'exclude') return 'include';
  return parsed;
}

export async function ApplicationsWorkspace({ searchParams }: { searchParams: ApplicationsSearchParams }) {
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  const client = getJobHarnessClient();
  const savedViewsPage = await client.savedViews.list({ workspace: 'applications', limit: 100, offset: 0 });
  const currentSavedViewDefinition = applicationSavedViewDefinitionFromParams(searchParams);
  const savedViewCreateId = randomUUID();
  const view = one(searchParams.view) === 'table' ? 'table' : 'board';
  const offset = view === 'table' ? nonNegativeInteger(searchParams.offset, 0) : 0;
  const stageRaw = optional(one(searchParams.stage));
  const stage = stageRaw ? ApplicationStageSchema.safeParse(stageRaw) : null;
  const terminal = terminalMode(one(searchParams.terminal), stage?.success ? stage.data : undefined);
  const from = dateStart(optional(one(searchParams.from)));
  const to = dateEnd(optional(one(searchParams.to)));

  const filterInput = {
    ...(optional(one(searchParams.company)) ? { company: optional(one(searchParams.company)) } : {}),
    ...(optional(one(searchParams.campaign)) ? { campaignId: optional(one(searchParams.campaign)) } : {}),
    ...(optional(one(searchParams.resume)) ? { resumeProfileId: optional(one(searchParams.resume)) } : {}),
    ...(from ? { appliedFrom: from } : {}),
    ...(to ? { appliedTo: to } : {}),
  } satisfies Omit<ListApplicationBoardInput, 'limit' | 'offset' | 'stages' | 'terminal'>;

  const selectedApplicationId = optional(one(searchParams.application));
  const generatedAt = new Date().toISOString();
  const requestedStage = stage?.success ? stage.data : null;
  const visibleStages: readonly ApplicationStage[] = requestedStage
    ? [requestedStage]
    : terminal === 'only'
      ? OUTCOME_STAGES
      : terminal === 'include'
        ? [...MAIN_STAGES, ...OUTCOME_STAGES]
        : MAIN_STAGES;

  const tableInput: ListApplicationBoardInput = {
    ...filterInput,
    limit: TABLE_PAGE_SIZE,
    offset,
    terminal,
    ...(requestedStage ? { stages: [requestedStage] } : {}),
  };
  const lanePromises = view === 'board'
    ? visibleStages.map(async (laneStage) => [
        laneStage,
        await client.workspace.listApplicationBoard({
          ...filterInput,
          limit: BOARD_LANE_PAGE_SIZE,
          offset: 0,
          stages: [laneStage],
          terminal: 'include',
        }),
      ] as const)
    : [];
  const [tablePage, laneEntries, campaignPage, resumePage, selectedDetail] = await Promise.all([
    view === 'table' ? client.workspace.listApplicationBoard(tableInput) : Promise.resolve(null),
    Promise.all(lanePromises),
    client.campaigns.list({ limit: 200, offset: 0 }),
    client.workspace.listResumeUsage({ limit: 200, offset: 0 }),
    selectedApplicationId
      ? client.workspace.getApplicationWorkspaceDetail(selectedApplicationId)
      : Promise.resolve(null),
  ]);
  const initialLanes = Object.fromEntries(laneEntries) as Partial<Record<ApplicationStage, ListApplicationBoardOutput>>;
  const resultTotal = view === 'board'
    ? laneEntries.reduce((sum, [, page]) => sum + page.total, 0)
    : tablePage?.total ?? 0;
  const closeHref = applicationsHref(searchParams, { application: null });
  const boardHref = applicationsHref(searchParams, { view: 'board', offset: null, application: null });
  const tableHref = applicationsHref(searchParams, { view: 'table', offset: 0, application: null });
  const copy = messages.applicationsWorkspace;

  return (
    <div className="workspace-page applications-workspace-page">
      <WorkspaceHeader
        title={messages.pages.applications.title}
        description={messages.pages.applications.description}
        actions={(
          <div className="applications-header-actions">
            <nav className="view-switcher" aria-label={messages.pages.applications.title}>
              <Link href={boardHref} data-active={view === 'board' ? 'true' : undefined}>{copy.views.board}</Link>
              <Link href={tableHref} data-active={view === 'table' ? 'true' : undefined}>{copy.views.table}</Link>
            </nav>
            <span className="workspace-result-count">{resultTotal} {copy.board.results}</span>
          </div>
        )}
      />
      <div className="workspace-surface applications-surface">
        <SavedViewsBar workspace="applications" views={savedViewsPage.items} currentDefinition={currentSavedViewDefinition} createId={savedViewCreateId} messages={messages} />
        <ApplicationsFilters params={searchParams} campaigns={campaignPage.items} resumes={resumePage.items} messages={messages} />
        {view === 'board' ? (
          <ApplicationsBoard
            initialLanes={initialLanes}
            visibleStages={visibleStages}
            lanePageSize={BOARD_LANE_PAGE_SIZE}
            filterInput={filterInput}
            params={searchParams}
            generatedAt={generatedAt}
            locale={locale}
            messages={messages}
            {...(selectedApplicationId ? { selectedApplicationId } : {})}
          />
        ) : (
          <>
            <ApplicationsTable
              items={tablePage?.items ?? []}
              params={searchParams}
              generatedAt={generatedAt}
              locale={locale}
              messages={messages}
              {...(selectedApplicationId ? { selectedApplicationId } : {})}
            />
            <ApplicationsPagination
              params={searchParams}
              offset={offset}
              limit={TABLE_PAGE_SIZE}
              total={tablePage?.total ?? 0}
              messages={messages}
            />
          </>
        )}
      </div>
      {selectedDetail ? (
        <ApplicationSidePanel detail={selectedDetail} closeHref={closeHref} locale={locale} messages={messages} />
      ) : null}
    </div>
  );
}
