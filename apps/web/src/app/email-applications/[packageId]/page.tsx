import Link from 'next/link';
import { notFound } from 'next/navigation';
import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { getLocale, getMessages } from '@/i18n/server';
import { getJobHarnessClient } from '@/lib/job-harness-client';
import { formatDateTime } from '@/lib/format';

export default async function EmailApplicationPage({ params }: { params: Promise<{ packageId: string }> }) {
  const { packageId } = await params;
  const client = getJobHarnessClient();
  const [messages, locale, detail] = await Promise.all([
    getMessages(),
    getLocale(),
    client.emailApplications.get(packageId),
  ]);
  if (!detail) notFound();
  const copy = messages.jobsWorkspace.emailApplication;
  const pkg = detail.package;
  return (
    <div className="workspace-page management-page">
      <WorkspaceHeader
        title={copy.title}
        description={copy.description}
        actions={<Link className="filter-reset" href={`/jobs/${pkg.jobId}`}>← {copy.back}</Link>}
      />
      <div className="management-content executor-attempt-detail">
        <section className="management-panel executor-review-card">
          <div className="executor-detail-grid">
            <div><span>{copy.recipient}</span><strong>{pkg.recipient}</strong></div>
            <div><span>{copy.intentState}</span><strong>{detail.intent.status}</strong></div>
            <div><span>{copy.attachment}</span><strong>{pkg.attachmentFileName}</strong></div>
            <div><span>{copy.draftHash}</span><code title={pkg.draftHash}>{pkg.draftHash.slice(0, 20)}…</code></div>
          </div>
          <p className="muted-copy">{formatDateTime(locale, pkg.createdAt)}</p>
        </section>
        <section className="management-panel executor-review-card">
          <h2>{copy.subject}</h2>
          <p>{pkg.subject}</p>
        </section>
        <section className="management-panel executor-review-card">
          <h2>{copy.body}</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{pkg.body}</pre>
        </section>
        <section className="management-panel executor-review-card">
          <h2>{copy.attachment}</h2>
          <p><code>{pkg.resumeArtifactId}</code></p>
          <form action="/downloads/resume-artifact" method="post">
            <input type="hidden" name="revisionId" value={pkg.resumeRevisionId} />
            <input type="hidden" name="kind" value="pdf" />
            <button className="filter-submit" type="submit">{copy.downloadResume}</button>
          </form>
        </section>
        <section className="management-panel executor-review-card executor-human-action-card">
          <p className="executor-boundary-note">{copy.providerBoundary}</p>
        </section>
      </div>
    </div>
  );
}
