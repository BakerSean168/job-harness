'use client';

import Link from 'next/link';
import { Bookmark, RefreshCw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type {
  ApplicationSavedViewDefinition,
  JobSavedViewDefinition,
  SavedView,
  SavedViewWorkspace,
  UpsertSavedViewInput,
} from '@job-harness/contracts';
import type { MessageCatalog } from '@/i18n';
import { deleteSavedViewAction, upsertSavedViewAction } from '@/app/saved-views/actions';
import { applicationsHrefFromSavedViewDefinition, jobsHrefFromSavedViewDefinition } from './query';

function savedViewHref(view: SavedView): string {
  return view.workspace === 'jobs'
    ? jobsHrefFromSavedViewDefinition(view.definition)
    : applicationsHrefFromSavedViewDefinition(view.definition);
}

export function SavedViewsBar({
  workspace,
  views,
  currentDefinition,
  createId,
  messages,
}: {
  workspace: SavedViewWorkspace;
  views: readonly SavedView[];
  currentDefinition: JobSavedViewDefinition | ApplicationSavedViewDefinition;
  createId: string;
  messages: MessageCatalog;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const copy = messages.savedViewsWorkspace;

  function run(input: UpsertSavedViewInput, successMessage: string) {
    setStatus(null);
    startTransition(async () => {
      const result = await upsertSavedViewAction(input);
      if (!result.ok) {
        setStatus(result.code === 'CONFLICT' ? copy.conflict : `${copy.failed}${result.message ? `: ${result.message}` : ''}`);
        return;
      }
      setStatus(successMessage);
      setName('');
      router.refresh();
    });
  }

  function create() {
    const normalized = name.trim();
    if (!normalized) return;
    run({ id: createId, workspace, name: normalized, definition: currentDefinition } as UpsertSavedViewInput, copy.saved);
  }

  function overwrite(view: SavedView) {
    run({ id: view.id, workspace, name: view.name, definition: currentDefinition } as UpsertSavedViewInput, copy.updated);
  }

  function remove(savedViewId: string) {
    setStatus(null);
    startTransition(async () => {
      const result = await deleteSavedViewAction(savedViewId);
      if (!result.ok) {
        setStatus(`${copy.failed}${result.message ? `: ${result.message}` : ''}`);
        return;
      }
      setStatus(copy.deleted);
      router.refresh();
    });
  }

  return (
    <section className="saved-views-bar" aria-label={copy.label}>
      <div className="saved-views-heading"><Bookmark aria-hidden="true" size={14} /><strong>{copy.label}</strong></div>
      <div className="saved-view-list">
        {views.length ? views.map((view) => (
          <div className="saved-view-chip" key={view.id}>
            <Link href={savedViewHref(view)} title={copy.apply}>{view.name}</Link>
            <button type="button" onClick={() => overwrite(view)} disabled={pending} title={copy.update} aria-label={`${copy.update}: ${view.name}`}><RefreshCw aria-hidden="true" size={11} /></button>
            <button type="button" onClick={() => remove(view.id)} disabled={pending} title={copy.delete} aria-label={`${copy.delete}: ${view.name}`}><Trash2 aria-hidden="true" size={11} /></button>
          </div>
        )) : <span className="saved-view-empty">{copy.empty}</span>}
      </div>
      <div className="saved-view-create">
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder={copy.namePlaceholder} aria-label={copy.namePlaceholder} />
        <button type="button" onClick={create} disabled={pending || !name.trim()}>{copy.saveCurrent}</button>
      </div>
      {status ? <span className="saved-view-status" role="status">{status}</span> : null}
    </section>
  );
}
