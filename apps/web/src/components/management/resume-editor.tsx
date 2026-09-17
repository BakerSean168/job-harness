'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { dump, load } from 'js-yaml';
import {
  ResumeLibrarySchema,
  ResumeProfileSchema,
  type ResumeLibrary,
  type ResumeProfile,
  type ResumeProfileContext,
  type ResumeRevision,
  type ResumeRevisionDiffOutput,
} from '@job-harness/resume-contracts';
import { publishResumeRevisionAction, saveResumeLibraryAction, saveResumeProfileAction } from '../../app/resumes/actions';

export interface ResumeEditorCopy {
  readonly preview: string;
  readonly details: string;
  readonly targetRole: string;
  readonly locale: string;
  readonly template: string;
  readonly profileVersion: string;
  readonly libraryVersion: string;
  readonly usage: string;
  readonly readOnly: string;
  readonly editProfile: string;
  readonly editShared: string;
  readonly formMode: string;
  readonly sourceMode: string;
  readonly save: string;
  readonly saving: string;
  readonly saved: string;
  readonly saveFailed: string;
  readonly sourceInvalid: string;
  readonly previewFailed: string;
  readonly sharedWarning: string;
  readonly name: string;
  readonly positioning: string;
  readonly documentTitle: string;
  readonly pdfName: string;
  readonly header: string;
  readonly displayName: string;
  readonly email: string;
  readonly phone: string;
  readonly website: string;
  readonly github: string;
  readonly unsavedChanges: string;
  readonly history: string;
  readonly noRevisions: string;
  readonly publish: string;
  readonly publishing: string;
  readonly publishNote: string;
  readonly published: string;
  readonly reusedRevision: string;
  readonly saveBeforePublish: string;
  readonly comparePrevious: string;
  readonly compareCurrent: string;
  readonly changes: string;
  readonly noChanges: string;
  readonly diffFailed: string;
}

interface Props {
  initialContext: ResumeProfileContext;
  initialHtml: string;
  initialRevisions: readonly ResumeRevision[];
  usage: { applications: number; screening: number; assessment: number; interview: number };
  usageLabels: { applications: string; screening: string; assessment: string; interview: string };
  applicationsHref: string;
  viewApplicationsLabel: string;
  copy: ResumeEditorCopy;
}

type Scope = 'profile' | 'library';
type Mode = 'form' | 'source';

function pickLocalized(value: Record<string, string | undefined>, locale: ResumeProfile['locale']): string {
  return value[locale] ?? value['zh-CN'] ?? value.en ?? '';
}

function setLocalized<T extends Record<string, string | undefined>>(value: T, locale: ResumeProfile['locale'], next: string): T {
  return { ...value, [locale]: next };
}

export function ResumeEditor({ initialContext, initialHtml, initialRevisions, usage, usageLabels, applicationsHref, viewApplicationsLabel, copy }: Props) {
  const [library, setLibrary] = useState<ResumeLibrary>(initialContext.library);
  const [profile, setProfile] = useState<ResumeProfile>(initialContext.profile);
  const [previewHtml, setPreviewHtml] = useState(initialHtml);
  const [revisions, setRevisions] = useState<readonly ResumeRevision[]>(initialRevisions);
  const [revisionNote, setRevisionNote] = useState('');
  const [revisionMessage, setRevisionMessage] = useState<string | null>(null);
  const [revisionDiff, setRevisionDiff] = useState<ResumeRevisionDiffOutput | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [scope, setScope] = useState<Scope>('profile');
  const [mode, setMode] = useState<Mode>('form');
  const [source, setSource] = useState(() => dump(initialContext.profile, { noRefs: true, lineWidth: 120 }));
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [profileDirty, setProfileDirty] = useState(false);
  const [libraryDirty, setLibraryDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const locale = profile.locale;
  const hasUnsavedChanges = profileDirty || libraryDirty;

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const confirmNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const element = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!element) return;
      const href = element.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      if (!window.confirm(copy.unsavedChanges)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const confirmSubmit = (event: SubmitEvent) => {
      if (!window.confirm(copy.unsavedChanges)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', confirmNavigation, true);
    document.addEventListener('submit', confirmSubmit, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', confirmNavigation, true);
      document.removeEventListener('submit', confirmSubmit, true);
    };
  }, [hasUnsavedChanges, copy.unsavedChanges]);

  useEffect(() => {
    setLibrary(initialContext.library);
    setProfile(initialContext.profile);
    setPreviewHtml(initialHtml);
    setRevisions(initialRevisions);
    setRevisionNote('');
    setRevisionMessage(null);
    setRevisionDiff(null);
    setProfileDirty(false);
    setLibraryDirty(false);
    setSaveMessage(null);
    setSourceError(null);
    setPreviewError(null);
    setSource(dump(scope === 'profile' ? initialContext.profile : initialContext.library, { noRefs: true, lineWidth: 120 }));
  }, [initialContext.library, initialContext.profile, initialHtml, initialRevisions]);

  useEffect(() => {
    if (mode === 'source') setSource(dump(scope === 'profile' ? profile : library, { noRefs: true, lineWidth: 120 }));
  }, [scope, mode]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('/resume/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ library, profile }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? copy.previewFailed);
        setPreviewHtml(String(payload.html));
        setPreviewError(null);
      } catch (error) {
        setPreviewError(error instanceof Error ? error.message : copy.previewFailed);
      }
    }, 320);
    return () => window.clearTimeout(timer);
  }, [library, profile, copy.previewFailed]);

  function updateProfile(next: ResumeProfile) { setProfile(next); setProfileDirty(true); setSaveMessage(null); }
  function updateLibrary(next: ResumeLibrary) { setLibrary(next); setLibraryDirty(true); setSaveMessage(null); }

  function onSourceChange(text: string) {
    setSource(text);
    try {
      const parsed = load(text);
      if (scope === 'profile') updateProfile(ResumeProfileSchema.parse(parsed));
      else updateLibrary(ResumeLibrarySchema.parse(parsed));
      setSourceError(null);
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : copy.sourceInvalid);
    }
  }

  async function loadRevisionDiff(revisionId: string, against: 'previous' | 'current') {
    setDiffLoading(true);
    try {
      const query = new URLSearchParams({ revisionId, against });
      const response = await fetch(`/resume/revision-diff?${query.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? copy.diffFailed);
      setRevisionDiff(payload as ResumeRevisionDiffOutput);
      setRevisionMessage(null);
    } catch (error) {
      setRevisionMessage(error instanceof Error ? error.message : copy.diffFailed);
    } finally {
      setDiffLoading(false);
    }
  }

  function publishRevision() {
    if (hasUnsavedChanges || sourceError) {
      setRevisionMessage(copy.saveBeforePublish);
      return;
    }
    setRevisionMessage(null);
    startTransition(async () => {
      const result = await publishResumeRevisionAction(profile.id, profile.version, library.version, revisionNote.trim() || null);
      if (!result.ok) { setRevisionMessage(`${copy.saveFailed}: ${result.message}`); return; }
      const published = result.value.revision;
      setRevisions((current) => [published, ...current.filter((item) => item.id !== published.id)].sort((a, b) => b.revisionNumber - a.revisionNumber));
      setRevisionNote('');
      setRevisionMessage(result.value.reused ? `${copy.reusedRevision} v${published.revisionNumber}` : `${copy.published} v${published.revisionNumber}`);
    });
  }

  function saveCurrentScope() {
    if (sourceError) return;
    setSaveMessage(null);
    startTransition(async () => {
      if (scope === 'profile') {
        if (!profileDirty) { setSaveMessage(copy.saved); return; }
        const result = await saveResumeProfileAction(profile.version, profile);
        if (!result.ok) { setSaveMessage(`${copy.saveFailed}: ${result.message}`); return; }
        setProfile(result.value.profile);
        setProfileDirty(false);
        setSaveMessage(copy.saved);
        if (mode === 'source') setSource(dump(result.value.profile, { noRefs: true, lineWidth: 120 }));
        return;
      }
      if (!libraryDirty) { setSaveMessage(copy.saved); return; }
      const result = await saveResumeLibraryAction(library.version, library);
      if (!result.ok) { setSaveMessage(`${copy.saveFailed}: ${result.message}`); return; }
      setLibrary(result.value);
      setLibraryDirty(false);
      setSaveMessage(copy.saved);
      if (mode === 'source') setSource(dump(result.value, { noRefs: true, lineWidth: 120 }));
    });
  }

  const dirty = scope === 'profile' ? profileDirty : libraryDirty;
  const status = useMemo(() => sourceError ?? previewError ?? saveMessage, [previewError, saveMessage, sourceError]);

  return (
    <>
      <section className="resume-profile-detail-pane">
        <div className="management-panel-heading"><h2>{copy.details}</h2><span>{profile.locale}</span></div>
        <div className="resume-editor-tabs" role="tablist" aria-label={copy.details}>
          <button type="button" data-active={scope === 'profile'} onClick={() => setScope('profile')}>{copy.editProfile}</button>
          <button type="button" data-active={scope === 'library'} onClick={() => setScope('library')}>{copy.editShared}</button>
          <span />
          <button type="button" data-active={mode === 'form'} onClick={() => setMode('form')}>{copy.formMode}</button>
          <button type="button" data-active={mode === 'source'} onClick={() => setMode('source')}>{copy.sourceMode}</button>
        </div>

        {scope === 'library' ? <p className="resume-shared-warning">{copy.sharedWarning}</p> : null}

        {mode === 'source' ? (
          <div className="resume-source-editor">
            <textarea spellCheck={false} value={source} onChange={(event) => onSourceChange(event.target.value)} aria-label={scope === 'profile' ? copy.editProfile : copy.editShared} />
          </div>
        ) : (
          <div className="resume-structured-editor">
            {scope === 'profile' ? (
              <>
                <label><span>{copy.name}</span><input value={pickLocalized(profile.name, locale)} onChange={(event) => updateProfile({ ...profile, name: setLocalized(profile.name, locale, event.target.value) })} /></label>
                <label><span>{copy.targetRole}</span><input value={pickLocalized(profile.targetRole, locale)} onChange={(event) => updateProfile({ ...profile, targetRole: setLocalized(profile.targetRole, locale, event.target.value) })} /></label>
                <label><span>{copy.positioning}</span><input value={pickLocalized(profile.positioning, locale)} onChange={(event) => updateProfile({ ...profile, positioning: setLocalized(profile.positioning, locale, event.target.value) })} /></label>
                <label><span>{copy.documentTitle}</span><input value={pickLocalized(profile.output.documentTitle, locale)} onChange={(event) => updateProfile({ ...profile, output: { ...profile.output, documentTitle: setLocalized(profile.output.documentTitle, locale, event.target.value) } })} /></label>
                <label><span>{copy.pdfName}</span><input value={profile.output.pdfName ? pickLocalized(profile.output.pdfName, locale) : ''} onChange={(event) => updateProfile({ ...profile, output: { ...profile.output, pdfName: event.target.value ? setLocalized(profile.output.pdfName ?? {}, locale, event.target.value) : null } })} /></label>
                <label><span>{copy.template}</span><input value={profile.templateId} onChange={(event) => updateProfile({ ...profile, templateId: event.target.value })} /></label>
                <label><span>{copy.header}</span><select value={profile.layout.header} onChange={(event) => updateProfile({ ...profile, layout: { ...profile.layout, header: event.target.value as ResumeProfile['layout']['header'] } })}><option value="without-photo">without-photo</option><option value="with-photo">with-photo</option></select></label>
              </>
            ) : (
              <>
                <label><span>{copy.displayName}</span><input value={pickLocalized(library.basics.displayName, locale)} onChange={(event) => updateLibrary({ ...library, basics: { ...library.basics, displayName: setLocalized(library.basics.displayName, locale, event.target.value) } })} /></label>
                <label><span>{copy.phone}</span><input value={library.basics.contact.phone ? pickLocalized(library.basics.contact.phone, locale) : ''} onChange={(event) => updateLibrary({ ...library, basics: { ...library.basics, contact: { ...library.basics.contact, phone: event.target.value ? setLocalized(library.basics.contact.phone ?? {}, locale, event.target.value) : null } } })} /></label>
                <label><span>{copy.email}</span><input type="email" value={library.basics.contact.email ?? ''} onChange={(event) => updateLibrary({ ...library, basics: { ...library.basics, contact: { ...library.basics.contact, email: event.target.value || null } } })} /></label>
                <label><span>{copy.website}</span><input value={library.basics.contact.website ?? ''} onChange={(event) => updateLibrary({ ...library, basics: { ...library.basics, contact: { ...library.basics.contact, website: event.target.value || null } } })} /></label>
                <label><span>{copy.github}</span><input value={library.basics.contact.github ?? ''} onChange={(event) => updateLibrary({ ...library, basics: { ...library.basics, contact: { ...library.basics.contact, github: event.target.value || null } } })} /></label>
              </>
            )}
          </div>
        )}

        <div className="resume-editor-footer">
          <div className="resume-version-pair"><span>{copy.profileVersion} v{profile.version}</span><span>{copy.libraryVersion} v{library.version}</span></div>
          <div className="resume-editor-save">
            {status ? <span data-error={sourceError || previewError || saveMessage?.startsWith(copy.saveFailed) ? 'true' : undefined}>{status}</span> : null}
            <button type="button" className="filter-submit" disabled={pending || !!sourceError || !dirty} onClick={saveCurrentScope}>{pending ? copy.saving : copy.save}</button>
          </div>
        </div>
        <div className="resume-history-panel">
          <div className="resume-history-heading"><h3>{copy.history}</h3><span>{revisions.length}</span></div>
          <div className="resume-publish-row">
            <input value={revisionNote} onChange={(event) => setRevisionNote(event.target.value)} placeholder={copy.publishNote} maxLength={2000} />
            <button type="button" className="filter-submit" disabled={pending || hasUnsavedChanges || !!sourceError} title={hasUnsavedChanges ? copy.saveBeforePublish : undefined} onClick={publishRevision}>{pending ? copy.publishing : copy.publish}</button>
          </div>
          {revisionMessage ? <p className="resume-revision-message">{revisionMessage}</p> : null}
          {revisions.length ? (
            <div className="resume-revision-list">
              {revisions.map((revision) => (
                <div key={revision.id} className="resume-revision-row">
                  <div><strong>v{revision.revisionNumber}</strong><span>{new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(revision.createdAt))}</span><small>{revision.note ?? revision.contentHash.slice(0, 12)}</small></div>
                  <div>
                    <button type="button" disabled={diffLoading} onClick={() => void loadRevisionDiff(revision.id, 'previous')}>{copy.comparePrevious}</button>
                    <button type="button" disabled={diffLoading} onClick={() => void loadRevisionDiff(revision.id, 'current')}>{copy.compareCurrent}</button>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="management-muted">{copy.noRevisions}</p>}
          {revisionDiff ? (
            <div className="resume-diff-panel">
              <strong>{revisionDiff.changes.length ? `${revisionDiff.changes.length} ${copy.changes}` : copy.noChanges}</strong>
              {revisionDiff.changes.length ? <ul>{revisionDiff.changes.slice(0, 40).map((change, index) => <li key={`${change.path}-${index}`}><code>{change.path}</code><span data-kind={change.kind}>{change.kind}</span><small>{JSON.stringify(change.before)} → {JSON.stringify(change.after)}</small></li>)}</ul> : null}
            </div>
          ) : null}
        </div>

        <div className="resume-profile-usage">
          <h3>{copy.usage}</h3>
          <div className="resume-usage-grid">
            <div><strong>{usage.applications}</strong><span>{usageLabels.applications}</span></div>
            <div><strong>{usage.screening}</strong><span>{usageLabels.screening}</span></div>
            <div><strong>{usage.assessment}</strong><span>{usageLabels.assessment}</span></div>
            <div><strong>{usage.interview}</strong><span>{usageLabels.interview}</span></div>
          </div>
          <a className="text-link" href={applicationsHref}>{viewApplicationsLabel}</a>
        </div>
      </section>

      <section className="resume-preview-pane">
        <div className="management-panel-heading"><h2>{copy.preview}</h2><span>A4</span></div>
        <div className="resume-preview-stage"><iframe title={`${pickLocalized(profile.name, locale)} ${copy.preview}`} srcDoc={previewHtml} sandbox="" /></div>
      </section>
    </>
  );
}
