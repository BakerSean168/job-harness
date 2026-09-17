'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { JOB_SOURCE_KINDS } from '@job-harness/domain';
import type { MessageCatalog } from '@/i18n';
import { RecordSidePanelDialog } from '@/components/ui/record-side-panel-dialog';
import { addJobAction, initialAddJobActionState } from '@/app/jobs/actions';

export function AddJobPanel({ closeHref, messages }: { closeHref: string; messages: MessageCatalog }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(addJobAction, initialAddJobActionState);
  const copy = messages.jobsWorkspace.add;

  useEffect(() => {
    if (state.ok && state.jobId) router.replace(`/jobs?job=${encodeURIComponent(state.jobId)}`, { scroll: false });
  }, [router, state.ok, state.jobId]);

  return (
    <RecordSidePanelDialog title={copy.title} closeLabel={messages.common.close} closeHref={closeHref}>
      <form className="job-add-form" action={action}>
        <p className="management-muted">{copy.description}</p>
        <div className="job-add-fields">
          <label className="management-field"><span>{copy.company}</span><input name="companyName" required autoFocus /></label>
          <label className="management-field"><span>{copy.role}</span><input name="title" required /></label>
          <div className="management-field-grid">
            <label className="management-field"><span>{copy.city}</span><input name="city" /></label>
            <label className="management-field"><span>{copy.source}</span><select name="sourceKind" defaultValue="manual">{JOB_SOURCE_KINDS.map((source) => <option key={source} value={source}>{messages.jobsWorkspace.sourceKinds[source]}</option>)}</select></label>
          </div>
          <label className="management-field"><span>{copy.url}</span><input name="url" type="url" placeholder="https://…" /></label>
          <label className="management-field"><span>{copy.externalId}</span><input name="externalId" /></label>
          <label className="management-field"><span>{copy.jd}</span><textarea name="description" rows={12} /></label>
        </div>
        <div className="job-add-footer">
          {state.ok ? <span className="management-success">{copy.saved}</span> : state.message ? <span className="management-error">{copy.failed}: {state.message}</span> : <span />}
          <button className="filter-submit" type="submit" disabled={pending}>{pending ? copy.saving : copy.save}</button>
        </div>
      </form>
    </RecordSidePanelDialog>
  );
}
