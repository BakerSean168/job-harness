import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { JobDetailContent } from '@/components/jobs/job-detail-content';
import { getLocale, getMessages } from '@/i18n/server';
import { getJobHarnessClient } from '@/lib/job-harness-client';

export default async function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const client = getJobHarnessClient();
  const [detail, messages, locale, resumeProfiles] = await Promise.all([
    client.workspace.getJobDetail(jobId),
    getMessages(),
    getLocale(),
    client.resume.listProfiles(),
  ]);
  if (!detail) notFound();

  return (
    <div className="workspace-page job-full-page">
      <WorkspaceHeader
        title={detail.job.title}
        description={detail.job.companyName}
        actions={(
          <Link className="back-link" href="/jobs">
            <ArrowLeft aria-hidden="true" size={15} />
            {messages.nav.jobs}
          </Link>
        )}
      />
      <div className="workspace-surface job-full-surface">
        <JobDetailContent detail={detail} locale={locale} messages={messages} resumeProfiles={resumeProfiles.items} />
      </div>
    </div>
  );
}
