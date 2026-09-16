import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type { ApplicationWorkspaceDetail } from '@job-harness/contracts';
import type { Locale, MessageCatalog } from '@/i18n';
import { formatDateTime } from '@/lib/format';
import { StatusBadge } from '@/components/jobs/status-badge';
import { ApplicationTransitionControls } from './application-transition-controls';

export function ApplicationDetailContent({
  detail,
  locale,
  messages,
  compact = false,
}: {
  detail: ApplicationWorkspaceDetail;
  locale: Locale;
  messages: MessageCatalog;
  compact?: boolean;
}) {
  const copy = messages.applicationsWorkspace;
  const { application, job } = detail;
  const primarySource = detail.primaryListing
    ? messages.jobsWorkspace.sourceKinds[detail.primaryListing.sourceKind]
    : '—';

  return (
    <div className="application-detail-content" data-compact={compact ? 'true' : undefined}>
      <div className="detail-heading">
        <div>
          <span className="detail-company">{job.companyName}</span>
          <h2>{job.title}</h2>
          <div className="detail-badges">
            <StatusBadge value={application.currentStage} label={messages.jobsWorkspace.applicationStages[application.currentStage]} />
            {job.city ? <span className="detail-meta-chip">{job.city}</span> : null}
          </div>
        </div>
        {detail.primaryListing?.url ? (
          <a className="external-link-button" href={detail.primaryListing.url} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden="true" size={15} />
            {messages.jobsWorkspace.detail.openOriginal}
          </a>
        ) : null}
      </div>

      <section className="detail-section">
        <h3>{copy.detail.summary}</h3>
        <dl className="detail-definition-grid application-definition-grid">
          <div><dt>{copy.detail.appliedAt}</dt><dd>{formatDateTime(locale, application.appliedAt)}</dd></div>
          <div><dt>{copy.detail.stageEntered}</dt><dd>{formatDateTime(locale, detail.stageEnteredAt)}</dd></div>
          <div><dt>{copy.detail.resume}</dt><dd>{detail.resume?.name ?? '—'}</dd></div>
          <div><dt>{copy.detail.submissions}</dt><dd>{detail.submissionCount}</dd></div>
          <div><dt>{copy.detail.source}</dt><dd>{primarySource}</dd></div>
          <div><dt>{copy.detail.latestEvent}</dt><dd>{detail.latestEvent ? messages.jobsWorkspace.eventTypes[detail.latestEvent.type] : '—'}</dd></div>
        </dl>
        {detail.campaigns.length ? (
          <div className="application-campaign-block">
            <span>{copy.detail.campaigns}</span>
            <div className="campaign-chip-row">
              {detail.campaigns.map((campaign) => <span key={campaign.id} className="detail-meta-chip">{campaign.name}</span>)}
            </div>
          </div>
        ) : null}
        <div className="application-detail-links">
          <Link className="text-link" href={`/jobs/${encodeURIComponent(job.id)}`}>{copy.detail.openJob}</Link>
        </div>
      </section>

      <ApplicationTransitionControls
        applicationId={application.id}
        jobId={job.id}
        currentStage={application.currentStage}
        messages={messages}
      />

      <section className="detail-section">
        <div className="section-title-row"><h3>{copy.detail.timeline}</h3><span>{detail.timeline.length}</span></div>
        <ol className="timeline-list">
          {detail.timeline.map((event) => (
            <li key={event.id}>
              <span className="timeline-dot" aria-hidden="true" />
              <div className="timeline-body">
                <div className="timeline-title-row">
                  <strong>{messages.jobsWorkspace.eventTypes[event.type]}</strong>
                  <time>{formatDateTime(locale, event.occurredAt)}</time>
                </div>
                {event.stage ? <StatusBadge value={event.stage} label={messages.jobsWorkspace.applicationStages[event.stage]} /> : null}
                <div className="timeline-provenance">{event.actor}</div>
                {event.note ? <p>{event.note}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {compact ? (
        <div className="detail-footer-link">
          <Link href={`/applications/${encodeURIComponent(application.id)}`}>{copy.detail.openFullPage}</Link>
        </div>
      ) : null}
    </div>
  );
}
