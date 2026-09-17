import { NextRequest, NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/auth/request';
import { getJobHarnessClient } from '@/lib/job-harness-client';

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  try {
    const payload = await request.json();
    const bytes = await getJobHarnessClient().resume.previewPdf(payload);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'pdf_preview_failed',
    }, { status: 422 });
  }
}
