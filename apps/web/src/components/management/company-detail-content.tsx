import Link from 'next/link';
import type { CompanyDetail } from '@job-harness/contracts';
import type { Locale, MessageCatalog } from '@/i18n';
import { formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/jobs/status-badge';

export function CompanyDetailContent({ detail, locale, messages, compact = false }: { detail: CompanyDetail; locale: Locale; messages: MessageCatalog; compact?: boolean }) {
  const copy = messages.companiesWorkspace;
  const activeStages = Object.entries(detail.applicationsByStage).filter(([, count]) => count > 0) as Array<[keyof typeof detail.applicationsByStage, number]>;
  return (
    <div className="company-detail-content" data-compact={compact ? 'true' : undefined}>
      <div className="detail-heading">
        <div>
          <span className="detail-company">{copy.detail.title}</span>
          <h2>{detail.company.name}</h2>
          <div className="detail-badges">
            <span className="detail-meta-chip">{detail.jobs.length} {copy.table.jobs}</span>
            <span className="detail-meta-chip">{detail.applications} {copy.table.applications}</span>
            <span className="detail-meta-chip">{detail.activePipeline} {copy.table.activePipeline}</span>
          </div>
        </div>
      </div>

      <section className="detail-section">
        <h3>{copy.detail.aliases}</h3>
        <div className="campaign-chip-row">{detail.company.aliases.length ? detail.company.aliases.map((alias) => <span className="detail-meta-chip" key={alias}>{alias}</span>) : <span className="empty-value">—</span>}</div>
      </section>

      <section className="detail-section">
        <h3>{copy.detail.sources}</h3>
        <div className="campaign-chip-row">{detail.sourceKinds.length ? detail.sourceKinds.map((source) => <span className="detail-meta-chip" key={source}>{messages.jobsWorkspace.sourceKinds[source]}</span>) : <span className="empty-value">—</span>}</div>
      </section>

      <section className="detail-section">
        <h3>{copy.detail.pipeline}</h3>
        <div className="company-stage-grid">
          {activeStages.length ? activeStages.map(([stage, count]) => (
            <div key={stage}><StatusBadge value={stage} label={messages.jobsWorkspace.applicationStages[stage]} /><strong>{count}</strong></div>
          )) : <span className="empty-value">—</span>}
        </div>
      </section>

      <section className="detail-section">
        <div className="section-title-row"><h3>{copy.detail.jobs}</h3><span>{detail.jobs.length}</span></div>
        {detail.jobs.length ? (
          <div className="company-job-list">
            {detail.jobs.map((job) => (
              <Link className="company-job-row" href={`/jobs?job=${encodeURIComponent(job.jobId)}`} key={job.jobId}>
                <div>
                  <strong>{job.title}</strong>
                  <span>{job.city ?? '—'} · {formatDate(locale, job.lastSeenAt)}</span>
                </div>
                <div className="company-job-statuses">
                  <StatusBadge value={job.state} label={messages.jobsWorkspace.states[job.state]} />
                  {job.application ? <StatusBadge value={job.application.currentStage} label={messages.jobsWorkspace.applicationStages[job.application.currentStage]} /> : null}
                </div>
              </Link>
            ))}
          </div>
        ) : <p className="management-empty">{copy.detail.noJobs}</p>}
      </section>

      {compact ? <div className="detail-footer-link"><Link href={`/companies/${encodeURIComponent(detail.company.id)}`}>{copy.detail.full}</Link></div> : null}
    </div>
  );
}
