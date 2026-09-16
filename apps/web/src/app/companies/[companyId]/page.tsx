import { notFound } from 'next/navigation';
import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { CompanyDetailContent } from '@/components/management/company-detail-content';
import { getLocale, getMessages } from '@/i18n/server';
import { getJobHarnessClient } from '@/lib/job-harness-client';

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const { companyId } = await params; const query = await searchParams; const raw = query.campaign; const campaignId = (Array.isArray(raw) ? raw[0] : raw)?.trim() || undefined;
  const [messages, locale, detail] = await Promise.all([getMessages(), getLocale(), getJobHarnessClient().workspace.getCompanyDetail(companyId, campaignId)]);
  if (!detail) notFound();
  return <div className="workspace-page management-page"><WorkspaceHeader title={detail.company.name} description={messages.pages.companies.description} /><div className="workspace-surface company-record-surface"><CompanyDetailContent detail={detail} locale={locale} messages={messages} /></div></div>;
}
