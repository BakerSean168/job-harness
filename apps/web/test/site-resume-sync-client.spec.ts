import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const originalApiUrl = process.env.JOB_HARNESS_API_URL;
const originalToken = process.env.JOB_HARNESS_AUTH_TOKEN;
afterEach(() => {
  if (originalApiUrl === undefined) delete process.env.JOB_HARNESS_API_URL; else process.env.JOB_HARNESS_API_URL = originalApiUrl;
  if (originalToken === undefined) delete process.env.JOB_HARNESS_AUTH_TOKEN; else process.env.JOB_HARNESS_AUTH_TOKEN = originalToken;
  vi.unstubAllGlobals();
});

describe('Resume manager site sync client', () => {
  it('starts a bounded site-resume-sync run and uploads an exact Artifact ID', async () => {
    process.env.JOB_HARNESS_API_URL = 'https://jh.example.test/api/v1';
    process.env.JOB_HARNESS_AUTH_TOKEN = 'secret';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id:'run-sync-1' }), { status:201, headers:{'content-type':'application/json'} }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        run:{ id:'run-sync-1', writeCount:1 }, artifactId:'artifact-1', artifactSha256:'a'.repeat(64),
        evidence:{ currentUrl:'https://c.liepin.com/resume/create', title:'完善简历', stateSignals:['选择简历'] },
      }), { status:200, headers:{'content-type':'application/json'} }));
    vi.stubGlobal('fetch', fetchMock);
    const { syncResumeArtifactToRecruitingSite } = await import('../src/lib/job-harness-client');
    const result = await syncResumeArtifactToRecruitingSite({ agentId:'windows-chrome-primary', targetUrl:'https://c.liepin.com/resume/create', artifactId:'artifact-1', fileName:'agent.pdf' });
    expect(result).toMatchObject({ runId:'run-sync-1', artifactId:'artifact-1', artifactSha256:'a'.repeat(64), writeCount:1, title:'完善简历' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://jh.example.test/internal/browser-bridge/v1/validation-runs');
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({ agentId:'windows-chrome-primary', targetUrl:'https://c.liepin.com/resume/create', mode:'site-resume-sync' });
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe('https://jh.example.test/internal/browser-bridge/v1/validation-runs/run-sync-1/sync-resume');
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))).toEqual({ artifactId:'artifact-1', fileName:'agent.pdf' });
  });
});
