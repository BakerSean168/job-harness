'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, GripVertical } from 'lucide-react';
import type { ApplicationBoardItem, ListApplicationBoardInput, ListApplicationBoardOutput } from '@job-harness/contracts';
import {
  APPLICATION_STAGES,
  canTransitionApplicationStage,
  type ApplicationStage,
} from '@job-harness/domain';
import type { Locale, MessageCatalog } from '@/i18n';
import { formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/jobs/status-badge';
import { loadApplicationLaneAction, transitionApplicationAction } from '@/app/applications/actions';
import { applicationsHref, type ApplicationsSearchParams } from './query';

const OUTCOME_STAGES: readonly ApplicationStage[] = ['rejected', 'withdrawn'];

type LanePages = Partial<Record<ApplicationStage, ListApplicationBoardOutput>>;
type LaneOffsets = Partial<Record<ApplicationStage, number>>;
type LaneTotals = Partial<Record<ApplicationStage, number>>;

function stageAgeDays(now: string, enteredAt: string): number {
  return Math.max(0, Math.floor((new Date(now).getTime() - new Date(enteredAt).getTime()) / 86_400_000));
}

function replaceStage(item: ApplicationBoardItem, stage: ApplicationStage, now: string): ApplicationBoardItem {
  return {
    ...item,
    application: { ...item.application, currentStage: stage, updatedAt: now },
    stageEnteredAt: now,
    latestEvent: item.latestEvent,
  };
}

function flattenLanes(lanes: LanePages, visibleStages: readonly ApplicationStage[]): ApplicationBoardItem[] {
  const seen = new Set<string>();
  const items: ApplicationBoardItem[] = [];
  for (const stage of visibleStages) {
    for (const item of lanes[stage]?.items ?? []) {
      if (seen.has(item.application.id)) continue;
      seen.add(item.application.id);
      items.push(item);
    }
  }
  return items;
}

function initialOffsets(lanes: LanePages, visibleStages: readonly ApplicationStage[]): LaneOffsets {
  return Object.fromEntries(visibleStages.map((stage) => [stage, lanes[stage]?.items.length ?? 0])) as LaneOffsets;
}

function initialTotals(lanes: LanePages, visibleStages: readonly ApplicationStage[]): LaneTotals {
  return Object.fromEntries(visibleStages.map((stage) => [stage, lanes[stage]?.total ?? 0])) as LaneTotals;
}

export function ApplicationsBoard({
  initialLanes,
  visibleStages,
  lanePageSize,
  filterInput,
  params,
  selectedApplicationId,
  generatedAt,
  locale,
  messages,
}: {
  initialLanes: LanePages;
  visibleStages: readonly ApplicationStage[];
  lanePageSize: number;
  filterInput: Omit<ListApplicationBoardInput, 'limit' | 'offset' | 'stages' | 'terminal'>;
  params: ApplicationsSearchParams;
  selectedApplicationId?: string;
  generatedAt: string;
  locale: Locale;
  messages: MessageCatalog;
}) {
  const router = useRouter();
  const [optimisticItems, setOptimisticItems] = useState<ApplicationBoardItem[]>(() => flattenLanes(initialLanes, visibleStages));
  const [laneOffsets, setLaneOffsets] = useState<LaneOffsets>(() => initialOffsets(initialLanes, visibleStages));
  const [laneTotals, setLaneTotals] = useState<LaneTotals>(() => initialTotals(initialLanes, visibleStages));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loadingStage, setLoadingStage] = useState<ApplicationStage | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const copy = messages.applicationsWorkspace;
  const visibleStageKey = visibleStages.join('|');

  useEffect(() => {
    setOptimisticItems(flattenLanes(initialLanes, visibleStages));
    setLaneOffsets(initialOffsets(initialLanes, visibleStages));
    setLaneTotals(initialTotals(initialLanes, visibleStages));
  }, [initialLanes, visibleStageKey]);

  const byStage = useMemo(() => {
    const result = new Map<ApplicationStage, ApplicationBoardItem[]>();
    for (const stage of APPLICATION_STAGES) result.set(stage, []);
    for (const item of optimisticItems) result.get(item.application.currentStage)?.push(item);
    return result;
  }, [optimisticItems]);

  const draggingItem = draggingId
    ? optimisticItems.find((item) => item.application.id === draggingId) ?? null
    : null;

  async function loadMore(stage: ApplicationStage) {
    if (loadingStage) return;
    const offset = laneOffsets[stage] ?? 0;
    const total = laneTotals[stage] ?? 0;
    if (offset >= total) return;
    setLoadingStage(stage);
    setErrorCode(null);
    const result = await loadApplicationLaneAction({
      ...filterInput,
      limit: lanePageSize,
      offset,
      stages: [stage],
      terminal: 'include',
    });
    if (!result.ok || !result.value) {
      setErrorCode(result.code ?? 'INTERNAL_ERROR');
      setLoadingStage(null);
      return;
    }
    const incoming = result.value.items;
    setOptimisticItems((current) => {
      const known = new Set(current.map((item) => item.application.id));
      return [...current, ...incoming.filter((item) => !known.has(item.application.id))];
    });
    setLaneOffsets((current) => ({ ...current, [stage]: offset + incoming.length }));
    setLaneTotals((current) => ({ ...current, [stage]: result.value!.total }));
    setLoadingStage(null);
  }

  async function move(item: ApplicationBoardItem, target: ApplicationStage) {
    if (pendingId) return;
    const current = item.application.currentStage;
    if (target === current) return;
    if (!canTransitionApplicationStage(current, target)) {
      setErrorCode('INVALID_TRANSITION');
      return;
    }

    const before = optimisticItems;
    const beforeTotals = laneTotals;
    const now = new Date().toISOString();
    setErrorCode(null);
    setPendingId(item.application.id);
    setOptimisticItems((currentItems) => currentItems.map((candidate) =>
      candidate.application.id === item.application.id ? replaceStage(candidate, target, now) : candidate
    ));
    setLaneTotals((totals) => ({
      ...totals,
      ...(totals[current] !== undefined ? { [current]: Math.max(0, (totals[current] ?? 0) - 1) } : {}),
      ...(totals[target] !== undefined ? { [target]: (totals[target] ?? 0) + 1 } : {}),
    }));

    const intentId = crypto.randomUUID();
    const occurredAt = new Date().toISOString();
    const result = await transitionApplicationAction(
      item.application.id,
      item.application.jobId,
      target,
      intentId,
      occurredAt,
    );
    if (!result.ok) {
      setOptimisticItems(before);
      setLaneTotals(beforeTotals);
      setErrorCode(result.code ?? 'INTERNAL_ERROR');
    } else {
      router.refresh();
    }
    setPendingId(null);
    setDraggingId(null);
  }

  function renderColumn(stage: ApplicationStage) {
    const stageItems = byStage.get(stage) ?? [];
    const total = laneTotals[stage] ?? 0;
    const loaded = laneOffsets[stage] ?? stageItems.length;
    const canLoadMore = loaded < total;
    const tone = OUTCOME_STAGES.includes(stage) ? 'outcome' : 'main';
    const canDrop = draggingItem
      ? canTransitionApplicationStage(draggingItem.application.currentStage, stage)
        && draggingItem.application.currentStage !== stage
      : false;
    return (
      <section
        key={stage}
        className="application-lane"
        data-tone={tone}
        data-drop-ready={canDrop ? 'true' : undefined}
        onDragOver={(event) => {
          if (canDrop) event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (draggingItem && canDrop) void move(draggingItem, stage);
        }}
      >
        <header className="application-lane-header">
          <span>{messages.jobsWorkspace.applicationStages[stage]}</span>
          <strong>{total}</strong>
        </header>
        <div className="application-lane-cards">
          {stageItems.length ? stageItems.map((item) => {
            const age = stageAgeDays(generatedAt, item.stageEnteredAt);
            const href = applicationsHref(params, { application: item.application.id });
            const validTargets = APPLICATION_STAGES.filter((candidate) =>
              candidate === item.application.currentStage
              || canTransitionApplicationStage(item.application.currentStage, candidate)
            );
            const isPending = pendingId === item.application.id;
            return (
              <article
                className="application-card"
                data-selected={selectedApplicationId === item.application.id ? 'true' : undefined}
                data-pending={isPending ? 'true' : undefined}
                draggable={!pendingId && validTargets.length > 1}
                onDragStart={(event) => {
                  setDraggingId(item.application.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', item.application.id);
                }}
                onDragEnd={() => setDraggingId(null)}
                key={item.application.id}
              >
                <div className="application-card-topline">
                  <GripVertical className="application-drag-handle" aria-hidden="true" size={15} />
                  <span>{item.companyName}</span>
                  {item.primaryListing?.url ? (
                    <a
                      className="application-card-external"
                      href={item.primaryListing.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={messages.jobsWorkspace.detail.openOriginal}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <ExternalLink aria-hidden="true" size={13} />
                    </a>
                  ) : null}
                </div>
                <Link className="application-card-title" href={href} scroll={false}>{item.title}</Link>
                <div className="application-card-meta">
                  {item.city ? <span>{item.city}</span> : null}
                  <span>{formatDate(locale, item.application.appliedAt)}</span>
                </div>
                <div className="application-card-badges">
                  <StatusBadge value={item.application.currentStage} label={messages.jobsWorkspace.applicationStages[item.application.currentStage]} />
                  {item.submissionCount > 1 ? <span className="detail-meta-chip">{item.submissionCount} {copy.board.submissions}</span> : null}
                </div>
                <dl className="application-card-facts">
                  <div><dt>{copy.table.resume}</dt><dd>{item.resume?.name ?? '—'}</dd></div>
                  <div><dt>{copy.board.stageAge}</dt><dd>{age === 0 ? copy.board.today : `${age} ${copy.board.days}`}</dd></div>
                </dl>
                <label className="application-stage-select">
                  <span>{copy.board.moveTo}</span>
                  <select
                    value={item.application.currentStage}
                    disabled={Boolean(pendingId) || validTargets.length <= 1}
                    onChange={(event) => void move(item, event.target.value as ApplicationStage)}
                  >
                    {validTargets.map((candidate) => (
                      <option key={candidate} value={candidate}>{messages.jobsWorkspace.applicationStages[candidate]}</option>
                    ))}
                  </select>
                </label>
                {isPending ? <div className="application-card-pending">{copy.board.moving}</div> : null}
              </article>
            );
          }) : <div className="application-lane-empty">{copy.board.noStageItems}</div>}
          {canLoadMore ? (
            <button
              className="application-lane-load-more"
              type="button"
              disabled={loadingStage !== null}
              onClick={() => void loadMore(stage)}
            >
              {loadingStage === stage ? copy.board.loadingMore : copy.board.loadMore}
              <span>{loaded} / {total}</span>
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  const mainStages = visibleStages.filter((stage) => !OUTCOME_STAGES.includes(stage));
  const outcomeStages = visibleStages.filter((stage) => OUTCOME_STAGES.includes(stage));

  return (
    <div className="applications-board-shell">
      <div className="applications-board-guidance">{copy.board.dragHint}</div>
      {errorCode ? (
        <div className="applications-board-error" role="alert">
          {errorCode === 'INVALID_TRANSITION' || errorCode === 'INVALID_STAGE'
            ? copy.board.invalidTransition
            : copy.board.transitionFailed}
        </div>
      ) : null}
      <div className="applications-board-viewport">
        {mainStages.length ? (
          <div className="applications-board-scroll">
            <div className="applications-board-grid" style={{ gridTemplateColumns: `repeat(${mainStages.length}, minmax(215px, 1fr))` }}>
              {mainStages.map((stage) => renderColumn(stage))}
            </div>
          </div>
        ) : null}
        {outcomeStages.length ? (
          <section className="applications-outcomes">
            <h2>{copy.board.outcomes}</h2>
            <div className="applications-board-scroll">
              <div className="applications-board-grid applications-board-grid-outcomes" style={{ gridTemplateColumns: `repeat(${outcomeStages.length}, minmax(215px, 1fr))` }}>
                {outcomeStages.map((stage) => renderColumn(stage))}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
