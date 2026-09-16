import Link from 'next/link';
import type { DiscoveryRunDetail } from '@job-harness/contracts';
import type { Locale, MessageCatalog } from '@/i18n';
import { formatDateTime } from '@/lib/format';

export function DiscoveryRunContent({
  detail,
  locale,
  messages,
  compact = false,
}: {
  detail: DiscoveryRunDetail;
  locale: Locale;
  messages: MessageCatalog;
  compact?: boolean;
}) {
  const { run, campaign } = detail;
  const copy = messages.discoveryWorkspace;
  return (
    <div className="discovery-detail-content" data-compact={compact ? 'true' : undefined}>
      <div className="detail-heading">
        <div>
          <span className="detail-company">{campaign?.name ?? copy.detail.noCampaign}</span>
          <h2>{copy.executors[run.executor]}</h2>
          <div className="detail-badges">
            <span className="detail-meta-chip">{run.completedAt ? copy.list.completed : copy.list.running}</span>
            <span className="detail-meta-chip">{copy.list.started} {formatDateTime(locale, run.startedAt)}</span>
          </div>
        </div>
      </div>

      <section className="detail-section">
        <h3>{copy.detail.title}</h3>
        <dl className="detail-definition-grid">
          <div><dt>{copy.list.candidates}</dt><dd>{run.candidateCount}</dd></div>
          <div><dt>{copy.list.inserted}</dt><dd>{run.insertedCount}</dd></div>
          <div><dt>{copy.list.duplicates}</dt><dd>{run.duplicateCount}</dd></div>
          <div><dt>{copy.list.rejected}</dt><dd>{run.rejectedCount}</dd></div>
          <div><dt>{copy.detail.observations}</dt><dd>{detail.observationCount}</dd></div>
          <div><dt>{copy.detail.completedAt}</dt><dd>{run.completedAt ? formatDateTime(locale, run.completedAt) : '—'}</dd></div>
        </dl>
      </section>

      <section className="detail-section">
        <div className="section-title-row"><h3>{copy.detail.context}</h3><span>{Object.keys(run.contextSnapshot).length}</span></div>
        {Object.keys(run.contextSnapshot).length
          ? <pre className="discovery-context-json">{JSON.stringify(run.contextSnapshot, null, 2)}</pre>
          : <p className="management-muted">{messages.common.noData}</p>}
      </section>

      <section className="detail-section">
        <div className="section-title-row"><h3>{copy.detail.affectedJobs}</h3><span>{detail.affectedJobs.length}</span></div>
        {detail.affectedJobs.length ? (
          <div className="discovery-job-list">
            {detail.affectedJobs.map((item) => (
              <Link href={`/jobs?job=${encodeURIComponent(item.jobId)}`} key={item.jobId} className="discovery-job-row">
                <div><strong>{item.title}</strong><span>{item.companyName}{item.city ? ` · ${item.city}` : ''}</span></div>
                <span>{copy.detail.openJob}</span>
              </Link>
            ))}
          </div>
        ) : <p className="management-empty">{copy.detail.noAffectedJobs}</p>}
      </section>

      {compact ? <div className="detail-footer-link"><Link href={`/discovery/${encodeURIComponent(run.id)}`}>{copy.detail.full}</Link></div> : null}
    </div>
  );
}
