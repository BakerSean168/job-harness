import Link from 'next/link';
import type { ResumeProfile } from '@job-harness/resume-contracts';
import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { ResumeEditor } from './resume-editor';
import { getMessages } from '@/i18n/server';
import { getJobHarnessClient } from '@/lib/job-harness-client';
import type { ManagementSearchParams } from './campaigns-workspace';

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function localized(value: ResumeProfile['name'], locale: ResumeProfile['locale']): string {
  return value[locale] ?? value['zh-CN'] ?? value.en ?? '—';
}

export async function ResumesWorkspace({ searchParams }: { searchParams: ManagementSearchParams }) {
  const messages = await getMessages();
  const client = getJobHarnessClient();
  const campaignId = one(searchParams.campaign)?.trim() || undefined;
  const requestedProfile = one(searchParams.profile)?.trim();
  const [profiles, campaignPage, usage] = await Promise.all([
    client.resume.listProfiles(),
    client.campaigns.list({ limit: 200, offset: 0 }),
    client.workspace.listResumeUsage({ limit: 200, offset: 0, ...(campaignId ? { campaignId } : {}) }),
  ]);
  const selected = profiles.items.find((profile) => profile.id === requestedProfile) ?? profiles.items[0] ?? null;
  const context = selected ? await client.resume.getProfileContext(selected.id) : null;
  const [preview, revisions] = context
    ? await Promise.all([
        client.resume.preview({ library: context.library, profile: context.profile }),
        client.resume.listRevisions(selected!.id),
      ])
    : [null, { items: [], total: 0 }];
  const usageByProfile = new Map(usage.items.map((item) => [item.resume.id, item]));
  const selectedUsage = selected ? usageByProfile.get(selected.id) ?? null : null;
  const copy = messages.resumesWorkspace;

  return (
    <div className="workspace-page management-page">
      <WorkspaceHeader title={messages.pages.resumes.title} description={messages.pages.resumes.description} />
      <div className="resume-builder-toolbar">
        <form className="management-filter-bar" method="get" action="/resumes">
          <label className="filter-field">
            <span>{copy.filters.campaign}</span>
            <select name="campaign" defaultValue={campaignId ?? ''}>
              <option value="">{copy.filters.all}</option>
              {campaignPage.items.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
            </select>
          </label>
          {selected ? <input type="hidden" name="profile" value={selected.id} /> : null}
          <button className="filter-submit" type="submit">{copy.filters.apply}</button>
          <Link className="filter-reset" href="/resumes">{copy.filters.reset}</Link>
        </form>
        <p>{copy.note}</p>
      </div>

      {selected && context && preview ? (
        <div className="resume-builder-surface">
          <aside className="resume-profile-pane" aria-label={copy.builder.profiles}>
            <div className="management-panel-heading"><h2>{copy.builder.profiles}</h2><span>{profiles.total}</span></div>
            <nav className="resume-profile-list">
              {profiles.items.map((profile) => {
                const itemUsage = usageByProfile.get(profile.id);
                const href = `/resumes?profile=${encodeURIComponent(profile.id)}${campaignId ? `&campaign=${encodeURIComponent(campaignId)}` : ''}`;
                return (
                  <Link key={profile.id} href={href} data-selected={profile.id === selected.id ? 'true' : undefined}>
                    <strong>{localized(profile.name, profile.locale)}</strong>
                    <span>{localized(profile.targetRole, profile.locale)}</span>
                    <small>v{profile.version} · {itemUsage?.applications ?? 0} {copy.table.applications}</small>
                  </Link>
                );
              })}
            </nav>
          </aside>

          <ResumeEditor
            key={selected.id}
            initialContext={context}
            initialHtml={preview.html}
            initialRevisions={revisions.items}
            revisionUsage={selectedUsage?.revisionUsage ?? []}
            usage={{
              applications: selectedUsage?.applications ?? 0,
              submissions: selectedUsage?.submissions ?? 0,
              screening: selectedUsage?.applicationsByStage.screening ?? 0,
              assessment: selectedUsage?.applicationsByStage.assessment ?? 0,
              interview: selectedUsage?.applicationsByStage.interview ?? 0,
            }}
            usageLabels={{
              applications: copy.table.applications,
              submissions: copy.table.submissions,
              screening: copy.table.screening,
              assessment: copy.table.assessment,
              interview: copy.table.interview,
            }}
            applicationsHref={`/applications?resume=${encodeURIComponent(selected.id)}${campaignId ? `&campaign=${encodeURIComponent(campaignId)}` : ''}`}
            viewApplicationsLabel={copy.table.viewApplications}
            copy={copy.builder}
          />
        </div>
      ) : (
        <div className="management-content">
          <section className="management-panel"><p className="management-empty">{copy.builder.noProfiles}</p></section>
        </div>
      )}
    </div>
  );
}
