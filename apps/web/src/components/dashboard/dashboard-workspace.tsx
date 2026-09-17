import Link from 'next/link';
import type {
  DashboardAttentionItem,
  DashboardSnapshot,
  JobSearchCampaign,
  ResumeUsageSummary,
} from '@job-harness/contracts';
import type { Locale, MessageCatalog } from '@/i18n';
import { getLocale, getMessages } from '@/i18n/server';
import { getJobHarnessClient } from '@/lib/job-harness-client';
import { formatDate, formatDateTime } from '@/lib/format';
import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { StatusBadge } from '@/components/jobs/status-badge';

export type DashboardSearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function scopedHref(path: string, campaignId: string | null, params: Record<string, string> = {}): string {
  const query = new URLSearchParams(params);
  if (campaignId) query.set('campaign', campaignId);
  const encoded = query.toString();
  return `${path}${encoded ? `?${encoded}` : ''}`;
}

function attentionHref(item: DashboardAttentionItem): string | null {
  if (item.applicationId) return `/applications?application=${encodeURIComponent(item.applicationId)}`;
  if (item.jobId) return `/jobs?job=${encodeURIComponent(item.jobId)}`;
  if (item.campaignId) return `/campaigns?campaign=${encodeURIComponent(item.campaignId)}`;
  if (item.resumeProfileId) return `/resumes?resume=${encodeURIComponent(item.resumeProfileId)}`;
  return null;
}

function campaignSummary(campaign: JobSearchCampaign | null, messages: MessageCatalog) {
  if (!campaign) return null;
  const copy = messages.dashboardWorkspace.campaign;
  const rows = [
    campaign.targetRoles.length ? [copy.roles, campaign.targetRoles.join(' · ')] : null,
    campaign.cities.length ? [copy.cities, campaign.cities.join(' > ')] : null,
    campaign.graduationYears.length ? [copy.graduation, campaign.graduationYears.join(' / ')] : null,
    campaign.experience.length ? [copy.experience, campaign.experience.join(' / ')] : null,
  ].filter((row): row is string[] => Boolean(row));
  return rows;
}

function formatUtcDay(locale: Locale, value: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`));
}

function KpiCard({ href, label, value }: { href: string; label: string; value: number }) {
  return (
    <Link className="dashboard-kpi-card" href={href}>
      <strong>{value}</strong>
      <span>{label}</span>
    </Link>
  );
}

function Funnel({ snapshot, campaignId, messages }: { snapshot: DashboardSnapshot; campaignId: string | null; messages: MessageCatalog }) {
  const copy = messages.dashboardWorkspace.funnel;
  const steps = [
    { key: 'discovered', label: copy.discovered, value: snapshot.funnel.discovered, href: scopedHref('/jobs', campaignId, { state: 'discovered' }) },
    { key: 'shortlisted', label: copy.shortlisted, value: snapshot.funnel.shortlisted, href: scopedHref('/jobs', campaignId, { state: 'shortlisted' }) },
    { key: 'applied', label: copy.applied, value: snapshot.funnel.applied, href: scopedHref('/applications', campaignId, { stage: 'applied' }) },
    { key: 'screening', label: copy.screening, value: snapshot.funnel.screening, href: scopedHref('/applications', campaignId, { stage: 'screening' }) },
    { key: 'assessment', label: copy.assessment, value: snapshot.funnel.assessment, href: scopedHref('/applications', campaignId, { stage: 'assessment' }) },
    { key: 'interview', label: copy.interview, value: snapshot.funnel.interview, href: scopedHref('/applications', campaignId, { stage: 'interview' }) },
    { key: 'offer', label: copy.offer, value: snapshot.funnel.offer, href: scopedHref('/applications', campaignId, { stage: 'offer' }) },
  ] as const;
  return (
    <section className="dashboard-panel dashboard-funnel-panel">
      <div className="dashboard-panel-heading"><h2>{copy.title}</h2></div>
      <div className="dashboard-funnel">
        {steps.map((step, index) => (
          <div className="dashboard-funnel-step-wrap" key={step.key}>
            <Link className="dashboard-funnel-step" href={step.href}>
              <strong>{step.value}</strong>
              <span>{step.label}</span>
            </Link>
            {index < steps.length - 1 ? <span className="dashboard-funnel-arrow" aria-hidden="true">→</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function AttentionPanel({ snapshot, locale, messages }: { snapshot: DashboardSnapshot; locale: Locale; messages: MessageCatalog }) {
  const copy = messages.dashboardWorkspace.attention;
  return (
    <section className="dashboard-panel dashboard-attention-panel">
      <div className="dashboard-panel-heading"><h2>{copy.title}</h2><span>{snapshot.attention.length}</span></div>
      {snapshot.attention.length ? (
        <div className="dashboard-attention-list">
          {snapshot.attention.map((item) => {
            const href = attentionHref(item);
            const content = (
              <>
                <div className="dashboard-attention-topline">
                  <span className="attention-severity" data-severity={item.severity}>{copy.severity[item.severity]}</span>
                  {item.stage ? <StatusBadge value={item.stage} label={messages.jobsWorkspace.applicationStages[item.stage]} /> : null}
                </div>
                <strong>{item.label}</strong>
                <p>{copy.kinds[item.kind]}</p>
                {item.sinceAt ? <time>{copy.since} {formatDate(locale, item.sinceAt)}</time> : null}
              </>
            );
            return href
              ? <Link className="dashboard-attention-item" href={href} key={item.id}>{content}</Link>
              : <div className="dashboard-attention-item" key={item.id}>{content}</div>;
          })}
        </div>
      ) : <p className="dashboard-empty-copy">{copy.empty}</p>}
    </section>
  );
}

function WeeklyActivity({ snapshot, locale, messages }: { snapshot: DashboardSnapshot; locale: Locale; messages: MessageCatalog }) {
  const copy = messages.dashboardWorkspace.weekly;
  const rows = [
    ['jobsObserved', copy.jobsObserved],
    ['opportunitiesInserted', copy.opportunitiesInserted],
    ['shortlisted', copy.shortlisted],
    ['applicationsRecorded', copy.applicationsRecorded],
    ['stageChanges', copy.stageChanges],
    ['interviewsScheduled', copy.interviewsScheduled],
  ] as const;
  return (
    <section className="dashboard-panel dashboard-weekly-panel">
      <div className="dashboard-panel-heading"><h2>{copy.title}</h2></div>
      <div className="dashboard-table-scroll">
        <table className="dashboard-matrix">
          <thead>
            <tr><th aria-label={copy.title} />{snapshot.weeklyActivity.map((point) => <th key={point.date}>{formatUtcDay(locale, point.date)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(([key, label]) => (
              <tr key={key}>
                <th>{label}</th>
                {snapshot.weeklyActivity.map((point) => (
                  <td key={point.date}>{point[key] == null ? <span title={copy.unavailable}>—</span> : point[key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="dashboard-note">{copy.utcNote}</p>
    </section>
  );
}

function ResumePanel({ items, locale, messages }: { items: readonly ResumeUsageSummary[]; locale: Locale; messages: MessageCatalog }) {
  const copy = messages.dashboardWorkspace.resumes;
  const rows = [...items].sort((a, b) => b.applications - a.applications || b.submissions - a.submissions || a.resume.name.localeCompare(b.resume.name)).slice(0, 6);
  return (
    <section className="dashboard-panel">
      <div className="dashboard-panel-heading"><h2>{copy.title}</h2></div>
      {rows.length ? (
        <div className="dashboard-compact-table-wrap">
          <table className="dashboard-compact-table">
            <thead><tr><th>{messages.nav.resumes}</th><th>{copy.applications}</th><th>{copy.submissions}</th><th>{copy.screening}</th><th>{copy.interview}</th><th>{copy.lastUsed}</th></tr></thead>
            <tbody>{rows.map((item) => (
              <tr key={item.resume.id}>
                <td><strong>{item.resume.name}</strong></td>
                <td>{item.applications}</td>
                <td>{item.submissions}</td>
                <td>{item.applicationsByStage.screening}</td>
                <td>{item.applicationsByStage.interview}</td>
                <td>{item.lastUsedAt ? formatDate(locale, item.lastUsedAt) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="dashboard-empty-copy">{copy.empty}</p>}
      <p className="dashboard-note">{copy.correlationNote}</p>
    </section>
  );
}

function SourcePanel({ snapshot, messages, campaignId }: { snapshot: DashboardSnapshot; messages: MessageCatalog; campaignId: string | null }) {
  const copy = messages.dashboardWorkspace.sources;
  return (
    <section className="dashboard-panel">
      <div className="dashboard-panel-heading"><h2>{copy.title}</h2></div>
      {snapshot.sourcePerformance.length ? (
        <div className="dashboard-compact-table-wrap">
          <table className="dashboard-compact-table">
            <thead><tr><th>{copy.source}</th><th>{copy.opportunities}</th><th>{copy.applications}</th><th>{copy.screening}</th><th>{copy.interview}</th></tr></thead>
            <tbody>{snapshot.sourcePerformance.slice(0, 8).map((item) => (
              <tr key={item.sourceKind}>
                <td><Link className="text-link" href={scopedHref('/jobs', campaignId, { source: item.sourceKind })}>{messages.jobsWorkspace.sourceKinds[item.sourceKind]}</Link></td>
                <td>{item.opportunities}</td>
                <td>{item.applications}</td>
                <td>{item.applicationsByStage.screening}</td>
                <td>{item.applicationsByStage.interview}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="dashboard-empty-copy">{copy.empty}</p>}
      <p className="dashboard-note">{copy.associationNote}</p>
    </section>
  );
}

function RecentDiscovery({ snapshot, locale, messages }: { snapshot: DashboardSnapshot; locale: Locale; messages: MessageCatalog }) {
  const copy = messages.dashboardWorkspace.recent;
  return (
    <section className="dashboard-panel">
      <div className="dashboard-panel-heading"><h2>{copy.title}</h2></div>
      {snapshot.recentDiscoveryRuns.length ? (
        <div className="dashboard-discovery-list">
          {snapshot.recentDiscoveryRuns.map(({ run, campaign }) => (
            <article key={run.id} className="dashboard-discovery-item">
              <div><strong>{campaign?.name ?? run.executor}</strong><span>{run.executor}</span></div>
              <dl>
                <div><dt>{copy.candidates}</dt><dd>{run.candidateCount}</dd></div>
                <div><dt>{copy.inserted}</dt><dd>{run.insertedCount}</dd></div>
                <div><dt>{copy.duplicates}</dt><dd>{run.duplicateCount}</dd></div>
                <div><dt>{copy.rejected}</dt><dd>{run.rejectedCount}</dd></div>
              </dl>
              <time>{copy.started}: {formatDateTime(locale, run.startedAt)}</time>
            </article>
          ))}
        </div>
      ) : <p className="dashboard-empty-copy">{copy.empty}</p>}
    </section>
  );
}

export async function DashboardWorkspace({ searchParams }: { searchParams: DashboardSearchParams }) {
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  const client = getJobHarnessClient();
  const campaignPage = await client.campaigns.list({ limit: 200, offset: 0 });
  const activeCampaigns = campaignPage.items.filter((campaign) => campaign.status === 'active');
  const requested = one(searchParams.campaign);
  const requestedCampaign = requested && requested !== 'all'
    ? campaignPage.items.find((campaign) => campaign.id === requested) ?? null
    : null;
  const selectedCampaign = requested === 'all' ? null : requestedCampaign ?? activeCampaigns[0] ?? null;
  const campaignId = selectedCampaign?.id ?? null;
  const snapshot = await client.workspace.getDashboardSnapshot({
    ...(campaignId ? { campaignId } : {}),
    recentDiscoveryLimit: 5,
    attentionLimit: 10,
  });
  const copy = messages.dashboardWorkspace;
  const summaryRows = campaignSummary(selectedCampaign, messages);

  return (
    <div className="workspace-page dashboard-page">
      <WorkspaceHeader
        title={messages.pages.overview.title}
        description={messages.pages.overview.description}
        actions={<span className="workspace-result-count">{copy.generatedAt} {formatDateTime(locale, snapshot.generatedAt)}</span>}
      />

      <div className="dashboard-content">
        <section className="dashboard-campaign-context">
          <div className="dashboard-campaign-selector-row">
            <div>
              <span>{copy.campaign.active}</span>
              <strong>{selectedCampaign?.name ?? copy.campaign.all}</strong>
            </div>
            <form method="get" action="/">
              <label>
                <span>{copy.campaign.label}</span>
                <select name="campaign" defaultValue={selectedCampaign?.id ?? 'all'}>
                  <option value="all">{copy.campaign.all}</option>
                  {campaignPage.items.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                </select>
              </label>
              <button className="filter-submit" type="submit">{messages.jobsWorkspace.filters.apply}</button>
            </form>
          </div>
          {summaryRows?.length ? (
            <dl className="dashboard-campaign-meta">
              {summaryRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
          ) : <p className="dashboard-empty-copy">{copy.campaign.noActive}</p>}
        </section>

        <section className="dashboard-kpi-grid">
          <KpiCard href={scopedHref('/jobs', campaignId)} label={copy.kpis.knownJobs} value={snapshot.kpis.knownJobs} />
          <KpiCard href={scopedHref('/inbox', campaignId)} label={copy.kpis.inbox} value={snapshot.kpis.inbox} />
          <KpiCard href={scopedHref('/jobs', campaignId, { state: 'shortlisted' })} label={copy.kpis.shortlisted} value={snapshot.kpis.shortlisted} />
          <KpiCard href={scopedHref('/applications', campaignId, { terminal: 'include' })} label={copy.kpis.applications} value={snapshot.kpis.applications} />
          <KpiCard href={scopedHref('/applications', campaignId, { terminal: 'exclude' })} label={copy.kpis.activePipeline} value={snapshot.kpis.activePipeline} />
          <KpiCard href={scopedHref('/applications', campaignId, { stage: 'interview' })} label={copy.kpis.interviews} value={snapshot.kpis.interviewStage} />
        </section>

        <Funnel snapshot={snapshot} campaignId={campaignId} messages={messages} />

        <div className="dashboard-two-column">
          <AttentionPanel snapshot={snapshot} locale={locale} messages={messages} />
          <RecentDiscovery snapshot={snapshot} locale={locale} messages={messages} />
        </div>

        <WeeklyActivity snapshot={snapshot} locale={locale} messages={messages} />

        <div className="dashboard-two-column">
          <SourcePanel snapshot={snapshot} messages={messages} campaignId={campaignId} />
          <ResumePanel items={snapshot.resumeUsage} locale={locale} messages={messages} />
        </div>
      </div>
    </div>
  );
}
