import { NextRequest, NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/auth/request';
import { getJobHarnessClient } from '@/lib/job-harness-client';

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  try {
    const payload = await request.json();
    const preview = await getJobHarnessClient().resume.preview(payload);
    return NextResponse.json(preview, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'preview_failed',
    }, { status: 422 });
  }
}
