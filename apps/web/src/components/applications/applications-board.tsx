'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, GripVertical } from 'lucide-react';
import type { ApplicationBoardItem } from '@job-harness/contracts';
import {
  APPLICATION_STAGES,
  canTransitionApplicationStage,
  type ApplicationStage,
} from '@job-harness/domain';
import type { Locale, MessageCatalog } from '@/i18n';
import { formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/jobs/status-badge';
import { transitionApplicationAction } from '@/app/applications/actions';
import { applicationsHref, type ApplicationsSearchParams } from './query';

const MAIN_STAGES: readonly ApplicationStage[] = ['applied', 'screening', 'assessment', 'interview', 'offer'];
const OUTCOME_STAGES: readonly ApplicationStage[] = ['rejected', 'withdrawn'];

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

export function ApplicationsBoard({
  items,
  params,
  selectedApplicationId,
  generatedAt,
  terminalMode,
  locale,
  messages,
}: {
  items: readonly ApplicationBoardItem[];
  params: ApplicationsSearchParams;
  selectedApplicationId?: string;
  generatedAt: string;
  terminalMode: 'exclude' | 'include' | 'only';
  locale: Locale;
  messages: MessageCatalog;
}) {
  const router = useRouter();
  const [optimisticItems, setOptimisticItems] = useState<ApplicationBoardItem[]>(() => [...items]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const copy = messages.applicationsWorkspace;

  useEffect(() => setOptimisticItems([...items]), [items]);

  const byStage = useMemo(() => {
    const result = new Map<ApplicationStage, ApplicationBoardItem[]>();
    for (const stage of APPLICATION_STAGES) result.set(stage, []);
    for (const item of optimisticItems) result.get(item.application.currentStage)?.push(item);
    return result;
  }, [optimisticItems]);

  const draggingItem = draggingId
    ? optimisticItems.find((item) => item.application.id === draggingId) ?? null
    : null;

  async function move(item: ApplicationBoardItem, target: ApplicationStage) {
    if (pendingId) return;
    const current = item.application.currentStage;
    if (target === current) return;
    if (!canTransitionApplicationStage(current, target)) {
      setErrorCode('INVALID_TRANSITION');
      return;
    }

    const before = optimisticItems;
    const now = new Date().toISOString();
    setErrorCode(null);
    setPendingId(item.application.id);
    setOptimisticItems((currentItems) => currentItems.map((candidate) =>
      candidate.application.id === item.application.id ? replaceStage(candidate, target, now) : candidate
    ));

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
      setErrorCode(result.code ?? 'INTERNAL_ERROR');
    } else {
      router.refresh();
    }
    setPendingId(null);
    setDraggingId(null);
  }

  function renderColumn(stage: ApplicationStage, tone: 'main' | 'outcome') {
    const stageItems = byStage.get(stage) ?? [];
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
          <strong>{stageItems.length}</strong>
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
        </div>
      </section>
    );
  }

  const showMain = terminalMode !== 'only';
  const showOutcomes = terminalMode !== 'exclude';

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
      {showMain ? (
        <div className="applications-board-scroll">
          <div className="applications-board-grid">
            {MAIN_STAGES.map((stage) => renderColumn(stage, 'main'))}
          </div>
        </div>
      ) : null}
      {showOutcomes ? (
        <section className="applications-outcomes">
          <h2>{copy.board.outcomes}</h2>
          <div className="applications-board-scroll">
            <div className="applications-board-grid applications-board-grid-outcomes">
              {OUTCOME_STAGES.map((stage) => renderColumn(stage, 'outcome'))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
