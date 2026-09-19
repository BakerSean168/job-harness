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
  it('prepares the recruiting-site state before uploading an exact Artifact ID', async () => {
    process.env.JOB_HARNESS_API_URL = 'https://jh.example.test/api/v1';
    process.env.JOB_HARNESS_AUTH_TOKEN = 'secret';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id:'run-sync-1' }), { status:201, headers:{'content-type':'application/json'} }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        state:'attachment_upload_ready', missingFacts:[], manualFacts:[], appliedFacts:[],
        run:{ id:'run-sync-1', writeCount:0 },
        evidence:{ currentUrl:'https://c.liepin.com/resume/create', title:'完善简历', stateSignals:['上传简历'] },
      }), { status:200, headers:{'content-type':'application/json'} }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        run:{ id:'run-sync-1', writeCount:1 }, artifactId:'artifact-1', artifactSha256:'a'.repeat(64),
        evidence:{ currentUrl:'https://c.liepin.com/resume/create', title:'完善简历', stateSignals:['选择简历'] },
      }), { status:200, headers:{'content-type':'application/json'} }));
    vi.stubGlobal('fetch', fetchMock);
    const { syncResumeArtifactToRecruitingSite } = await import('../src/lib/job-harness-client');
    const result = await syncResumeArtifactToRecruitingSite({ agentId:'windows-chrome-primary', targetUrl:'https://c.liepin.com/resume/create', artifactId:'artifact-1', fileName:'agent.pdf' });
    expect(result).toMatchObject({ state:'uploaded', runId:'run-sync-1', artifactId:'artifact-1', artifactSha256:'a'.repeat(64), writeCount:1, title:'完善简历' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://jh.example.test/internal/browser-bridge/v1/validation-runs');
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({ agentId:'windows-chrome-primary', targetUrl:'https://c.liepin.com/resume/create', mode:'site-resume-sync' });
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe('https://jh.example.test/internal/browser-bridge/v1/validation-runs/run-sync-1/prepare-resume');
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe('https://jh.example.test/internal/browser-bridge/v1/validation-runs/run-sync-1/sync-resume');
    expect(JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit).body))).toEqual({ artifactId:'artifact-1', fileName:'agent.pdf' });
  });

  it('returns a typed onboarding blocker without attempting PDF upload', async () => {
    process.env.JOB_HARNESS_API_URL = 'https://jh.example.test/api/v1';
    process.env.JOB_HARNESS_AUTH_TOKEN = 'secret';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id:'run-sync-2' }), { status:201, headers:{'content-type':'application/json'} }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        state:'profile_onboarding_required',
        missingFacts:['gender','birthDate','careerIdentity'],
        manualFacts:[],
        appliedFacts:['displayName','email'],
        run:{ id:'run-sync-2', writeCount:2 },
        evidence:{ currentUrl:'https://c.liepin.com/resume/create', title:'完善简历', stateSignals:[] },
      }), { status:200, headers:{'content-type':'application/json'} }));
    vi.stubGlobal('fetch', fetchMock);
    const { syncResumeArtifactToRecruitingSite } = await import('../src/lib/job-harness-client');
    const result = await syncResumeArtifactToRecruitingSite({ agentId:'windows-chrome-primary', targetUrl:'https://c.liepin.com/resume/create', artifactId:'artifact-2', fileName:'agent.pdf' });
    expect(result).toMatchObject({
      state:'profile_onboarding_required',
      runId:'run-sync-2',
      artifactId:'artifact-2',
      writeCount:2,
      missingFacts:['gender','birthDate','careerIdentity'],
      appliedFacts:['displayName','email'],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns a typed education-onboarding blocker without attempting PDF upload', async () => {
    process.env.JOB_HARNESS_API_URL = 'https://jh.example.test/api/v1';
    process.env.JOB_HARNESS_AUTH_TOKEN = 'secret';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id:'run-sync-3' }), { status:201, headers:{'content-type':'application/json'} }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        state:'education_onboarding_required',
        missingFacts:['education[0].admissionType'],
        manualFacts:['education[0].admissionType'],
        appliedFacts:['education[0].school','education[0].degree','education[0].major','education[0].startMonth','education[0].endMonth'],
        run:{ id:'run-sync-3', writeCount:10 },
        evidence:{ currentUrl:'https://c.liepin.com/resume/create', title:'完善教育经历', stateSignals:[] },
      }), { status:200, headers:{'content-type':'application/json'} }));
    vi.stubGlobal('fetch', fetchMock);
    const { syncResumeArtifactToRecruitingSite } = await import('../src/lib/job-harness-client');
    const result = await syncResumeArtifactToRecruitingSite({ agentId:'windows-chrome-primary', targetUrl:'https://c.liepin.com/resume/create', artifactId:'artifact-3', fileName:'agent.pdf' });
    expect(result).toMatchObject({
      state:'education_onboarding_required', runId:'run-sync-3', artifactId:'artifact-3', writeCount:10,
      missingFacts:['education[0].admissionType'], manualFacts:['education[0].admissionType'],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
