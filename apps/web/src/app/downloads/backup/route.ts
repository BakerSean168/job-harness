import { fetchJobHarnessDataDownload } from '@/lib/job-harness-client';

export async function GET() {
  const upstream = await fetchJobHarnessDataDownload('backup');
  if (!upstream.ok) {
    return Response.json({ error: 'backup_failed', status: upstream.status }, { status: upstream.status });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/vnd.sqlite3',
      'content-disposition': upstream.headers.get('content-disposition') ?? 'attachment; filename="job-harness-backup.db"',
      ...(upstream.headers.get('content-length') ? { 'content-length': upstream.headers.get('content-length')! } : {}),
      'cache-control': 'no-store',
    },
  });
}
