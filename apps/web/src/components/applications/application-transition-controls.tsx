'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { APPLICATION_STAGES, canTransitionApplicationStage, type ApplicationStage } from '@job-harness/domain';
import { ApplicationStageSchema } from '@job-harness/contracts';
import type { MessageCatalog } from '@/i18n';
import { transitionApplicationAction } from '@/app/applications/actions';

export function ApplicationTransitionControls({
  applicationId,
  jobId,
  currentStage,
  messages,
}: {
  applicationId: string;
  jobId: string;
  currentStage: ApplicationStage;
  messages: MessageCatalog;
}) {
  const router = useRouter();
  const targets = useMemo(
    () => APPLICATION_STAGES.filter((stage) => stage !== currentStage && canTransitionApplicationStage(currentStage, stage)),
    [currentStage],
  );
  const [target, setTarget] = useState<ApplicationStage | ''>(targets[0] ?? '');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const copy = messages.applicationsWorkspace;

  useEffect(() => {
    setTarget(targets[0] ?? '');
  }, [targets]);

  if (!targets.length) return null;

  async function submit(selected: ApplicationStage) {
    setPending(true);
    setError(false);
    const intentId = crypto.randomUUID();
    const occurredAt = new Date().toISOString();
    const result = await transitionApplicationAction(applicationId, jobId, selected, intentId, occurredAt, note);
    if (!result.ok) setError(true);
    else {
      setNote('');
      router.refresh();
    }
    setPending(false);
  }

  return (
    <section className="application-transition-box">
      <h3>{copy.detail.transition}</h3>
      <div className="application-transition-row">
        <select value={target} onChange={(event) => { const parsed = ApplicationStageSchema.safeParse(event.target.value); if (parsed.success) setTarget(parsed.data); }} disabled={pending}>
          {targets.map((stage) => <option key={stage} value={stage}>{messages.jobsWorkspace.applicationStages[stage]}</option>)}
        </select>
        <button type="button" className="filter-submit" disabled={pending || !target} onClick={() => target && void submit(target)}>
          {pending ? copy.board.moving : copy.detail.transition}
        </button>
      </div>
      <label className="application-transition-note">
        <span>{copy.detail.optionalNote}</span>
        <textarea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={copy.detail.notePlaceholder}
          disabled={pending}
        />
      </label>
      <div className="application-terminal-actions">
        {targets.includes('rejected') ? (
          <button type="button" className="action-button" data-tone="danger" disabled={pending} onClick={() => void submit('rejected')}>{copy.detail.reject}</button>
        ) : null}
        {targets.includes('withdrawn') ? (
          <button type="button" className="action-button" disabled={pending} onClick={() => void submit('withdrawn')}>{copy.detail.withdraw}</button>
        ) : null}
      </div>
      {error ? <p className="application-transition-error" role="alert">{copy.board.transitionFailed}</p> : null}
    </section>
  );
}
