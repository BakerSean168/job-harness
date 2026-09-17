'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { JobListing } from '@job-harness/contracts';
import type { ResumeProfile } from '@job-harness/resume-contracts';
import { APPLICATION_SUBMISSION_CHANNELS } from '@job-harness/domain';
import type { Locale, MessageCatalog } from '@/i18n';
import { initialRecordApplicationActionState, recordApplicationAction } from '@/app/applications/actions';

function localized(value: Record<string, string | undefined>, locale: ResumeProfile['locale'] | Locale): string {
  return value[locale] ?? value['zh-CN'] ?? value.en ?? '';
}

function localDateTimeValue(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function RecordApplicationForm({
  jobId,
  listings,
  profiles,
  locale,
  messages,
  hasExistingApplication,
}: {
  jobId: string;
  listings: readonly JobListing[];
  profiles: readonly ResumeProfile[];
  locale: Locale;
  messages: MessageCatalog;
  hasExistingApplication: boolean;
}) {
  const router = useRouter();
  const appliedAtRef = useRef<HTMLInputElement>(null);
  const appliedAtIsoRef = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(recordApplicationAction, initialRecordApplicationActionState);
  const copy = messages.jobsWorkspace.record;

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  return (
    <form
      className="record-application-form"
      action={action}
      onSubmit={() => {
        const local = appliedAtRef.current?.value;
        if (local && appliedAtIsoRef.current) appliedAtIsoRef.current.value = new Date(local).toISOString();
      }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <input ref={appliedAtIsoRef} type="hidden" name="appliedAtIso" defaultValue={new Date().toISOString()} />
      <div className="record-application-heading">
        <strong>{hasExistingApplication ? copy.recordAgain : copy.title}</strong>
        <span>{copy.hint}</span>
      </div>
      <div className="record-application-grid">
        <label className="management-field">
          <span>{copy.appliedAt}</span>
          <input ref={appliedAtRef} type="datetime-local" defaultValue={localDateTimeValue()} required />
        </label>
        <label className="management-field">
          <span>{copy.listing}</span>
          <select name="listingId" defaultValue={listings[0]?.id ?? ''}>
            <option value="">{copy.none}</option>
            {listings.map((listing) => <option key={listing.id} value={listing.id}>{messages.jobsWorkspace.sourceKinds[listing.sourceKind]}{listing.label ? ` · ${listing.label}` : ''}</option>)}
          </select>
        </label>
        <label className="management-field">
          <span>{copy.channel}</span>
          <select name="channel" defaultValue={listings[0]?.sourceKind ?? 'manual'}>
            <option value="">{copy.none}</option>
            {APPLICATION_SUBMISSION_CHANNELS.map((channel) => <option key={channel} value={channel}>{messages.applicationsWorkspace.submissionChannels[channel]}</option>)}
          </select>
        </label>
        <label className="management-field">
          <span>{copy.resume}</span>
          <select name="resumeProfileId" defaultValue="">
            <option value="">{copy.none}</option>
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{localized(profile.name, locale)} · {localized(profile.targetRole, locale)}</option>)}
          </select>
        </label>
      </div>
      <label className="record-application-evidence">
        <input type="checkbox" name="linkLatestRevision" defaultChecked />
        <span>{copy.linkLatestRevision}<small>{copy.linkLatestRevisionHint}</small></span>
      </label>
      <label className="management-field"><span>{copy.note}</span><textarea name="note" rows={3} placeholder={copy.notePlaceholder} /></label>
      <div className="record-application-footer">
        {state.ok ? <span className="management-success">{copy.saved}</span> : state.message ? <span className="management-error">{copy.failed}: {state.message}</span> : <span />}
        <button className="filter-submit" type="submit" disabled={pending}>{pending ? copy.saving : copy.save}</button>
      </div>
    </form>
  );
}
