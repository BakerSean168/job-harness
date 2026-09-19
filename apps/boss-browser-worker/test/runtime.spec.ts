import { describe, expect, it } from 'vitest';
import type {
  BrowserActionSnapshot,
  BrowserBackendPort,
  BrowserControlSnapshot,
  BrowserDriverPort,
  BrowserSessionPort,
  BrowserUploadFile,
} from '@job-harness/apply-browser';
import { bossBrowserInternals, runBossBrowserDiscovery, type BossBrowserBridgePort } from '../src/runtime';

class FakeDriver implements BrowserDriverPort {
  url = 'about:blank';
  body = '';
  searched = '';
  clicks: string[] = [];
  scrolls: number[] = [];
  navigations: string[] = [];
  loggedOut = false;

  async navigate(url: string) {
    this.url = url;
    this.navigations.push(url);
    this.body = this.loggedOut ? '登录/注册 APP扫码登录' : 'BOSS直聘';
  }
  currentUrl() { return this.url; }
  async refreshCurrentUrl() { return this.url; }
  async title() { return this.url.includes('/job_detail/') ? 'Agent开发工程师' : 'BOSS直聘'; }
  async bodyText() { return this.body; }
  async exists(selector: string) { return selector === '.search-form input' || selector === '.search-btn'; }
  async text(selector: string) {
    if (!this.url.includes('/job_detail/')) return null;
    if (selector === '.name h1') return 'Agent开发工程师';
    if (selector === '.name .salary') return '15-25K';
    if (selector === '.sider-company .company-info a') return '示例科技';
    if (selector === '.job-banner .text-city') return '杭州';
    if (selector === '.job-sec-text') return '负责 Agent Harness、MCP、TypeScript。';
    return null;
  }
  async fill(_selector: string, value: string) { this.searched = value; }
  async select() {}
  async setChecked() {}
  async click(selector: string) { this.clicks.push(selector); }
  async upload(_selector: string, _file: BrowserUploadFile) {}
  async wait() {}
  async scroll(deltaY: number) { this.scrolls.push(deltaY); }
  async screenshot() { return new Uint8Array(); }
  async scanControls(): Promise<readonly BrowserControlSnapshot[]> { return []; }
  async scanActions(): Promise<readonly BrowserActionSnapshot[]> {
    if (!this.url.includes('/web/geek/job')) return [];
    return [
      {
        actionRef: '[data-job-harness-action-id="jha-job"]',
        tag: 'a',
        text: 'Agent开发工程师',
        href: 'https://www.zhipin.com/job_detail/abc123.html?lid=noise&ka=search_list_jname_1',
        type: null,
        role: null,
        disabled: false,
        ariaDisabled: false,
      },
    ];
  }
  async formStateHash() { return 'a'.repeat(64); }
}

function backend(driver: FakeDriver) {
  const state = { persisted: 0, retained: 0, released: 0 };
  let retained = false;
  const session: BrowserSessionPort = {
    backendId: 'fake',
    sessionId: 'fake-session',
    humanControlUrl: 'https://viewer.example/ui',
    driver: () => driver,
    async persist() { state.persisted += 1; },
    async retainForHuman(request) {
      state.persisted += 1;
      state.retained += 1;
      retained = true;
      return { backendId: 'fake', sessionRef: 'fake-session', humanControlUrl: 'https://viewer.example/ui', retainedAt: '2026-09-19T08:00:00.000Z', expiresAt: request.expiresAt };
    },
    async release() { if (!retained) state.released += 1; },
  };
  const value: BrowserBackendPort = {
    id: 'fake',
    describe: () => ({ id: 'fake', kind: 'managed-remote', persistentSession: true, humanControl: true, metadata: {} }),
    async health() { return { ok: true, detail: null }; },
    async acquire() { return session; },
    async resume() { return session; },
    async reapExpired() { return 0; },
  };
  return { backend: value, state };
}

function bridge() {
  const reports: any[] = [];
  const logs: any[] = [];
  const scores: string[] = [];
  const value: BossBrowserBridgePort = {
    async listKeywords() { return ['AI Agent', '前端开发']; },
    async score(_profileId, jobText) {
      scores.push(jobText);
      return { score: 88, introduce: 'hello', resumeIndex: 0, profileId: 'ai-agent-forgeflow', profileLabel: 'ForgeFlow', decision: 'strong-match' };
    },
    async reportDiscovery(input) { reports.push(input); },
    async logDecision(_profileId, input) { logs.push(input); },
  };
  return { bridge: value, reports, logs, scores };
}

describe('BOSS browser provider recovery', () => {
  it('restores keyword search -> detail -> canonical score/discovery flow without chat/resume/submit actions', async () => {
    const driver = new FakeDriver();
    const b = backend(driver);
    const c = bridge();
    const result = await runBossBrowserDiscovery({
      backend: b.backend,
      bridge: c.bridge,
      profileId: 'ai-agent-app',
      maxKeywords: 1,
      maxJobsPerKeyword: 3,
      maxTotalJobs: 3,
      threshold: 58,
      now: () => '2026-09-19T08:00:00.000Z',
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(result).toMatchObject({
      status: 'completed',
      keywords: ['AI Agent'],
      discoveredUrls: 1,
      inspectedJobs: 1,
      reportedJobs: 1,
      scoredJobs: 1,
      passedJobs: 1,
    });
    expect(driver.searched).toBe('AI Agent');
    expect(driver.clicks).toEqual(['.search-btn']);
    expect(driver.scrolls.length).toBeGreaterThan(0);
    expect(driver.clicks.join(' ')).not.toMatch(/沟通|简历|投递|申请/);
    expect(c.scores[0]).toContain('# 职位名称\nAgent开发工程师');
    expect(c.reports[0]).toMatchObject({
      jobUrl: 'https://www.zhipin.com/job_detail/abc123.html?ka=search_list_jname_1',
      title: 'Agent开发工程师',
      companyName: '示例科技',
      city: '杭州',
      salary: '15-25K',
      discoverySessionId: 'boss-browser-20260919080000',
    });
    expect(c.logs[0]).toMatchObject({
      action: 'job_decision_consumed',
      scene: 'boss-browser-worker',
      score: 88,
      screeningPassed: true,
      resumeIndex: 0,
    });
    expect(b.state).toEqual({ persisted: 1, retained: 0, released: 1 });
  });

  it('fails closed on login/human-verification states before scoring or reporting', async () => {
    const driver = new FakeDriver();
    driver.loggedOut = true;
    const b = backend(driver);
    const c = bridge();

    const result = await runBossBrowserDiscovery({
      backend: b.backend,
      bridge: c.bridge,
      profileId: 'ai-agent-app',
      keywords: ['AI Agent'],
      now: () => '2026-09-19T08:00:00.000Z',
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(result).toMatchObject({ status: 'login_required', discoveredUrls: 0, scoredJobs: 0, reportedJobs: 0, humanControlUrl: 'https://viewer.example/ui' });
    expect(c.scores).toEqual([]);
    expect(c.reports).toEqual([]);
    expect(c.logs).toEqual([]);
    expect(driver.clicks).toEqual([]);
    expect(b.state).toEqual({ persisted: 1, retained: 1, released: 0 });
  });

  it('canonicalizes only BOSS job_detail URLs and removes tracking noise', () => {
    expect(bossBrowserInternals.canonicalBossJobUrl('https://www.zhipin.com/job_detail/abc.html?lid=x&ka=search')).toBe('https://www.zhipin.com/job_detail/abc.html?ka=search');
    expect(bossBrowserInternals.canonicalBossJobUrl('https://evil.example/job_detail/abc')).toBeNull();
  });
});
