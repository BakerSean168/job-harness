import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type { JobDetail } from '@job-harness/contracts';
import type { Locale, MessageCatalog } from '@/i18n';
import { formatDateTime } from '@/lib/format';
import { StatusBadge } from './status-badge';
import { TriageActions } from './triage-actions';

export function JobDetailContent({
  detail,
  locale,
  messages,
  closeHref,
  closeAfterMutation = false,
  compact = false,
}: {
  detail: JobDetail;
  locale: Locale;
  messages: MessageCatalog;
  closeHref?: string;
  closeAfterMutation?: boolean;
  compact?: boolean;
}) {
  const copy = messages.jobsWorkspace;
  const { job } = detail;
  return (
    <div className="job-detail-content" data-compact={compact ? 'true' : undefined}>
      <div className="detail-heading">
        <div>
          <span className="detail-company">{job.companyName}</span>
          <h2>{job.title}</h2>
          <div className="detail-badges">
            <StatusBadge value={job.state} label={copy.states[job.state]} />
            {detail.application ? (
              <StatusBadge
                value={detail.application.application.currentStage}
                label={copy.applicationStages[detail.application.application.currentStage]}
              />
            ) : null}
            {job.city ? <span className="detail-meta-chip">{job.city}</span> : null}
          </div>
        </div>
        {detail.primaryListing?.url ? (
          <a className="external-link-button" href={detail.primaryListing.url} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden="true" size={15} />
            {copy.detail.openOriginal}
          </a>
        ) : null}
      </div>

      <TriageActions
        jobId={job.id}
        currentState={job.state}
        copy={copy.actions}
        closeAfterMutation={closeAfterMutation}
        {...(closeHref ? { closeHref } : {})}
      />

      <section className="detail-section">
        <h3>{copy.detail.overview}</h3>
        <dl className="detail-definition-grid">
          <div><dt>{copy.detail.firstSeen}</dt><dd>{formatDateTime(locale, job.firstSeenAt)}</dd></div>
          <div><dt>{copy.detail.lastSeen}</dt><dd>{formatDateTime(locale, job.lastSeenAt)}</dd></div>
        </dl>
        {detail.campaigns.length ? (
          <div className="campaign-chip-row">
            {detail.campaigns.map((campaign) => <span key={campaign.id} className="detail-meta-chip">{campaign.name}</span>)}
          </div>
        ) : null}
        <h4>{copy.detail.description}</h4>
        <p className="job-description">{job.description?.trim() || copy.detail.noDescription}</p>
      </section>

      <section className="detail-section">
        <div className="section-title-row">
          <h3>{copy.detail.listings}</h3>
          <span>{job.listings.length}</span>
        </div>
        <div className="listing-list">
          {job.listings.map((listing) => (
            <article className="listing-item" key={listing.id}>
              <div className="listing-item-main">
                <strong>{listing.label || copy.sourceKinds[listing.sourceKind]}</strong>
                <span>{copy.sourceKinds[listing.sourceKind]}</span>
              </div>
              <StatusBadge value={listing.status} label={copy.listingStatuses[listing.status]} />
              <div className="listing-time">{formatDateTime(locale, listing.lastSeenAt)}</div>
              {listing.url ? (
                <a href={listing.url} target="_blank" rel="noreferrer" className="listing-open" aria-label={copy.detail.openOriginal}>
                  <ExternalLink aria-hidden="true" size={14} />
                </a>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="detail-section">
        <h3>{copy.detail.application}</h3>
        {detail.application ? (
          <div className="application-summary">
            <dl className="detail-definition-grid">
              <div>
                <dt>{copy.detail.currentStage}</dt>
                <dd>{copy.applicationStages[detail.application.application.currentStage]}</dd>
              </div>
              <div><dt>{copy.detail.appliedAt}</dt><dd>{formatDateTime(locale, detail.application.application.appliedAt)}</dd></div>
              <div><dt>{copy.detail.resume}</dt><dd>{detail.application.resume?.name ?? '—'}</dd></div>
              <div><dt>{copy.detail.submissions}</dt><dd>{detail.application.submissionCount}</dd></div>
            </dl>
          </div>
        ) : <p className="muted-copy">{copy.detail.noApplication}</p>}
      </section>

      {detail.application?.timeline.length ? (
        <section className="detail-section">
          <h3>{copy.detail.timeline}</h3>
          <ol className="timeline-list">
            {detail.application.timeline.map((event) => (
              <li key={event.id}>
                <span className="timeline-dot" aria-hidden="true" />
                <div className="timeline-body">
                  <div className="timeline-title-row">
                    <strong>{copy.eventTypes[event.type]}</strong>
                    <time>{formatDateTime(locale, event.occurredAt)}</time>
                  </div>
                  {event.stage ? <StatusBadge value={event.stage} label={copy.applicationStages[event.stage]} /> : null}
                  {event.note ? <p>{event.note}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {detail.observations.length ? (
        <section className="detail-section">
          <div className="section-title-row"><h3>{copy.detail.observations}</h3><span>{detail.observations.length}</span></div>
          <div className="observation-list">
            {detail.observations.slice(0, compact ? 12 : 50).map(({ observation, listing }) => (
              <div className="observation-item" key={observation.id}>
                <span>{copy.sourceKinds[listing.sourceKind]}</span>
                <StatusBadge value={observation.availability} label={copy.listingStatuses[observation.availability]} />
                <time>{formatDateTime(locale, observation.observedAt)}</time>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {compact ? (
        <div className="detail-footer-link">
          <Link href={`/jobs/${encodeURIComponent(job.id)}`}>{copy.detail.openFullPage}</Link>
        </div>
      ) : null}
    </div>
  );
}
