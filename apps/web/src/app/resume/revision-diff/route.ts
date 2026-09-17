import { NextRequest, NextResponse } from 'next/server';
import { getJobHarnessClient } from '@/lib/job-harness-client';

export async function GET(request: NextRequest) {
  const revisionId = request.nextUrl.searchParams.get('revisionId')?.trim();
  const against = request.nextUrl.searchParams.get('against') === 'current' ? 'current' : 'previous';
  if (!revisionId) return NextResponse.json({ error: 'revision_id_required' }, { status: 400 });
  try {
    const diff = await getJobHarnessClient().resume.diffRevision(revisionId, { against });
    if (!diff) return NextResponse.json({ error: 'revision_not_found' }, { status: 404 });
    return NextResponse.json(diff, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'revision_diff_failed' }, { status: 422 });
  }
}
