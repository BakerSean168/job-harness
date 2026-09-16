import { notFound } from 'next/navigation';
import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { DiscoveryRunContent } from '@/components/management/discovery-run-content';
import { getLocale, getMessages } from '@/i18n/server';
import { getJobHarnessClient } from '@/lib/job-harness-client';

export default async function DiscoveryRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const [messages, locale, detail] = await Promise.all([getMessages(), getLocale(), getJobHarnessClient().workspace.getDiscoveryRunDetail(runId)]);
  if (!detail) notFound();
  return <div className="workspace-page management-page"><WorkspaceHeader title={messages.discoveryWorkspace.detail.title} description={messages.pages.discovery.description} /><div className="workspace-surface discovery-record-surface"><DiscoveryRunContent detail={detail} locale={locale} messages={messages} /></div></div>;
}
