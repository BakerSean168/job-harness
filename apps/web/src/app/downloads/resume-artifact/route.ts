import { NextRequest } from 'next/server';
import { isSameOriginRequest } from '../../../auth/request';
import { fetchJobHarnessResumeArtifact, getJobHarnessClient } from '../../../lib/job-harness-client';

function safeBaseName(value: string): string {
  const cleaned = value.normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 120) || 'resume';
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  const form = await request.formData();
  const revisionId = typeof form.get('revisionId') === 'string' ? String(form.get('revisionId')).trim() : '';
  const kindRaw = typeof form.get('kind') === 'string' ? String(form.get('kind')) : '';
  if (!revisionId || !['pdf', 'html', 'json'].includes(kindRaw)) return Response.json({ error: 'invalid_artifact_request' }, { status: 400 });
  const kind = kindRaw as 'pdf' | 'html' | 'json';

  try {
    const client = getJobHarnessClient();
    const [materialized, detail] = await Promise.all([
      client.resume.materializeArtifact({ revisionId, kind }),
      client.resume.getRevision(revisionId),
    ]);
    if (!detail) return Response.json({ error: 'revision_not_found' }, { status: 404 });
    const upstream = await fetchJobHarnessResumeArtifact(materialized.artifact.id);
    if (!upstream.ok) return Response.json({ error: 'artifact_download_failed', status: upstream.status }, { status: upstream.status });
    const base = safeBaseName(detail.revision.resolvedDocumentSnapshot.output.pdfName ?? detail.revision.resolvedDocumentSnapshot.output.documentTitle);
    const filename = `${base}-v${detail.revision.revisionNumber}.${kind}`;
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? materialized.artifact.mimeType,
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        ...(upstream.headers.get('content-length') ? { 'content-length': upstream.headers.get('content-length')! } : {}),
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'artifact_materialization_failed' }, { status: 503 });
  }
}
