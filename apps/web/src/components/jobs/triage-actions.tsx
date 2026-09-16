'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Job } from '@job-harness/contracts';
import type { MessageCatalog } from '@/i18n';
import { setJobStateAction } from '@/app/jobs/actions';

type ActionCopy = MessageCatalog['jobsWorkspace']['actions'];

function actionsFor(state: Job['state']): Array<{ state: Job['state']; label: keyof ActionCopy; tone?: string }> {
  switch (state) {
    case 'discovered':
      return [
        { state: 'shortlisted', label: 'shortlist', tone: 'primary' },
        { state: 'ignored', label: 'ignore' },
        { state: 'closed', label: 'close' },
      ];
    case 'shortlisted':
      return [
        { state: 'ignored', label: 'ignore' },
        { state: 'closed', label: 'close' },
      ];
    case 'ignored':
      return [
        { state: 'shortlisted', label: 'shortlist', tone: 'primary' },
        { state: 'discovered', label: 'rediscover' },
      ];
    case 'closed':
    case 'archived':
      return [{ state: 'discovered', label: 'rediscover', tone: 'primary' }];
  }
}

export function TriageActions({
  jobId,
  currentState,
  copy,
  closeAfterMutation,
  closeHref,
}: {
  jobId: string;
  currentState: Job['state'];
  copy: ActionCopy;
  closeAfterMutation?: boolean;
  closeHref?: string;
}) {
  const router = useRouter();
  const [pendingState, setPendingState] = useState<Job['state'] | null>(null);
  const [failed, setFailed] = useState(false);

  async function update(state: Job['state']) {
    if (pendingState) return;
    setFailed(false);
    setPendingState(state);
    const result = await setJobStateAction(jobId, state, crypto.randomUUID());
    setPendingState(null);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    if (closeAfterMutation && closeHref) router.replace(closeHref, { scroll: false });
    else router.refresh();
  }

  return (
    <div className="triage-action-wrap">
      <div className="triage-actions" aria-busy={pendingState ? 'true' : undefined}>
        {actionsFor(currentState).map((action) => (
          <button
            key={action.state}
            type="button"
            className="action-button"
            data-tone={action.tone ?? 'secondary'}
            disabled={Boolean(pendingState)}
            onClick={() => void update(action.state)}
          >
            {pendingState === action.state ? copy.updating : copy[action.label]}
          </button>
        ))}
      </div>
      {failed ? <p className="action-error" role="alert">{copy.failed}</p> : null}
    </div>
  );
}
