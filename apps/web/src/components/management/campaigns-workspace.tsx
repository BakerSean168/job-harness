import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import type { JobSearchCampaign } from '@job-harness/contracts';
import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { getLocale, getMessages } from '@/i18n/server';
import { getJobHarnessClient } from '@/lib/job-harness-client';
import { formatDateTime } from '@/lib/format';
import { CampaignForm } from './campaign-form';

export type ManagementSearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function CampaignCard({ campaign, selected, locale, messages }: { campaign: JobSearchCampaign; selected: boolean; locale: Awaited<ReturnType<typeof getLocale>>; messages: Awaited<ReturnType<typeof getMessages>> }) {
  const copy = messages.campaignsWorkspace;
  return (
    <Link className="campaign-card" data-selected={selected ? 'true' : undefined} href={`/campaigns?campaign=${encodeURIComponent(campaign.id)}`}>
      <div className="campaign-card-heading"><strong>{campaign.name}</strong><span data-status={campaign.status}>{copy.status[campaign.status]}</span></div>
      <dl>
        <div><dt>{copy.list.roles}</dt><dd>{campaign.targetRoles.slice(0, 3).join(' · ')}</dd></div>
        <div><dt>{copy.list.cities}</dt><dd>{campaign.cities.length ? campaign.cities.join(' > ') : '—'}</dd></div>
        <div><dt>{copy.list.resumes}</dt><dd>{campaign.resumeProfileIds.length}</dd></div>
      </dl>
      <time>{copy.list.updated} {formatDateTime(locale, campaign.updatedAt)}</time>
    </Link>
  );
}

export async function CampaignsWorkspace({ searchParams }: { searchParams: ManagementSearchParams }) {
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  const client = getJobHarnessClient();
  const [campaignPage, resumePage] = await Promise.all([
    client.campaigns.list({ limit: 200, offset: 0 }),
    client.workspace.listResumeUsage({ limit: 200, offset: 0 }),
  ]);
  const requested = one(searchParams.campaign);
  const creating = one(searchParams.new) === '1' || campaignPage.items.length === 0;
  const selected = creating
    ? null
    : campaignPage.items.find((campaign) => campaign.id === requested) ?? campaignPage.items[0] ?? null;
  const editorId = selected?.id ?? randomUUID();
  const copy = messages.campaignsWorkspace;

  return (
    <div className="workspace-page management-page">
      <WorkspaceHeader
        title={messages.pages.campaigns.title}
        description={messages.pages.campaigns.description}
        actions={<Link className="filter-submit" href="/campaigns?new=1">{copy.list.create}</Link>}
      />
      <div className="management-split-surface">
        <section className="campaign-list-pane">
          <div className="management-panel-heading"><h2>{copy.list.title}</h2><span>{campaignPage.total}</span></div>
          {campaignPage.items.length ? (
            <div className="campaign-card-list">
              {campaignPage.items.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} selected={selected?.id === campaign.id} locale={locale} messages={messages} />)}
            </div>
          ) : <p className="management-empty">{copy.list.empty}</p>}
        </section>
        <section className="campaign-editor-pane">
          <CampaignForm key={editorId} campaignId={editorId} campaign={selected} resumes={resumePage.items} messages={messages} />
          {selected ? (
            <div className="campaign-context-links">
              <Link href={`/jobs?campaign=${encodeURIComponent(selected.id)}`}>{copy.links.jobs}</Link>
              <Link href={`/applications?campaign=${encodeURIComponent(selected.id)}`}>{copy.links.applications}</Link>
              <Link href={`/?campaign=${encodeURIComponent(selected.id)}`}>{copy.links.dashboard}</Link>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
