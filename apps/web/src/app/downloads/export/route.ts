import { fetchJobHarnessDataDownload } from '@/lib/job-harness-client';

export async function GET() {
  const upstream = await fetchJobHarnessDataDownload('export');
  if (!upstream.ok) {
    return Response.json({ error: 'export_failed', status: upstream.status }, { status: upstream.status });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
      'content-disposition': upstream.headers.get('content-disposition') ?? 'attachment; filename="job-harness-export.json"',
      ...(upstream.headers.get('content-length') ? { 'content-length': upstream.headers.get('content-length')! } : {}),
      'cache-control': 'no-store',
    },
  });
}
