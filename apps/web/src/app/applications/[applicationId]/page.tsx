import { notFound } from 'next/navigation';
import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { ApplicationDetailContent } from '@/components/applications/application-detail-content';
import { getLocale, getMessages } from '@/i18n/server';
import { getJobHarnessClient } from '@/lib/job-harness-client';

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const [messages, locale, detail] = await Promise.all([
    getMessages(),
    getLocale(),
    getJobHarnessClient().workspace.getApplicationWorkspaceDetail(applicationId),
  ]);
  if (!detail) notFound();

  return (
    <div className="workspace-page application-record-page">
      <WorkspaceHeader title={detail.job.title} description={detail.job.companyName} />
      <div className="workspace-surface application-record-surface">
        <ApplicationDetailContent detail={detail} locale={locale} messages={messages} />
      </div>
    </div>
  );
}
