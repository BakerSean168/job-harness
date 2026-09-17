import { describe, expect, it } from 'vitest';
import { GET, POST } from '../src/app/labs/apply-canary/route';

describe('synthetic ATS real-browser canary', () => {
  it('renders a non-submitting application surface and records only submit-boundary evidence', async () => {
    const runId = `test-canary-${Date.now()}`;
    const page = await GET(new Request(`https://job-harness.test/labs/apply-canary?run=${runId}`));
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('Job Harness Synthetic ATS Canary');
    expect(html).toContain('name="full_name"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="school"');
    expect(html).toContain('name="major"');
    expect(html).toContain('name="visa"');
    expect(html).toContain('Submit application');

    const before = await GET(new Request(`https://job-harness.test/labs/apply-canary?run=${runId}&format=status`));
    expect(await before.json()).toMatchObject({ runId, submitCount: 0, lastSubmission: null });

    const submit = await POST(new Request(`https://job-harness.test/labs/apply-canary?run=${runId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ full_name: 'Private Name', email: 'private@example.test', school: 'Private School', major: 'Private Major', visa: '' }),
    }));
    expect(await submit.json()).toMatchObject({ ok: true, runId, submitCount: 1, synthetic: true });

    const after = await GET(new Request(`https://job-harness.test/labs/apply-canary?run=${runId}&format=status`));
    const status = await after.json() as { submitCount: number; lastSubmission: Record<string, { present: boolean; length: number }> };
    expect(status.submitCount).toBe(1);
    expect(status.lastSubmission.full_name).toEqual({ present: true, length: 12 });
    expect(JSON.stringify(status)).not.toContain('Private Name');
    expect(JSON.stringify(status)).not.toContain('private@example.test');
  });

  it('rejects missing or unsafe run ids', async () => {
    expect((await GET(new Request('https://job-harness.test/labs/apply-canary'))).status).toBe(400);
    expect((await GET(new Request('https://job-harness.test/labs/apply-canary?run=%2Funsafe'))).status).toBe(400);
  });
});
