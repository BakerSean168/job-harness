import { describe, expect, it } from 'vitest';
import { FormIRSchema, type FillPlan, type FillReport } from '@job-harness/apply-contracts';
import type { BrowserActionSnapshot, BrowserDriverPort } from '@job-harness/apply-browser';
import { NowcoderAtsSiteAdapter } from '../src';

const resumeForm = FormIRSchema.parse({
  version: 1,
  observedAt: '2026-09-18T03:00:00.000Z',
  source: { adapterId: 'nowcoder-ats', adapterVersion: '2026-09-18.5', host: 'www.nowcoder.com' },
  pages: [{ id: 'page-1', url: 'https://www.nowcoder.com/jobs/detail/463747', title: 'Agent开发工程师', sectionIds: [], fieldIds: ['resume'] }],
  sections: [],
  fields: [{
    id: 'resume', pageId: 'page-1', controlRef: '#resume', type: 'file', label: '', name: 'resumeFile',
    required: false, disabled: false, readOnly: false, options: [], semanticHints: ['resume-upload'],
    sensitivityHint: null, accept: 'application/pdf,.pdf', multiple: false,
  }],
});

const plan: FillPlan = {
  version: 1,
  formVersion: 'form-nowcoder-resume-v1',
  catalogVersion: 'catalog-with-resume',
  bindings: [{ fieldId: 'resume', applicantKey: 'documents.resume', confidence: 1, source: 'playbook', reason: 'fixture' }],
  instructions: [{ fieldId: 'resume', applicantKey: 'documents.resume', method: 'attach_file', source: 'playbook', confidence: 1 }],
  pending: [],
  prohibited: [],
};

const filledReport: FillReport = {
  results: [{ fieldId: 'resume', applicantKey: 'documents.resume', status: 'filled', method: 'attach_file', detail: null }],
  filled: 1, skipped: 0, failed: 0, manual: 0,
};

function action(text: string): BrowserActionSnapshot {
  return { actionRef: `#${text}`, tag: 'button', text, href: null, type: 'button', role: null, disabled: false, ariaDisabled: false };
}

function submitBrowser(confirm: boolean, clicks: string[]): BrowserDriverPort {
  let submitted = false;
  return {
    async navigate() {},
    currentUrl: () => 'https://www.nowcoder.com/jobs/detail/463747',
    async refreshCurrentUrl() { return 'https://www.nowcoder.com/jobs/detail/463747'; },
    async title() { return 'Agent开发工程师'; },
    async bodyText() { return submitted && confirm ? '职位详情 继续沟通' : '职位详情'; },
    async exists() { return false; },
    async text() { return null; },
    async fill() {},
    async select() {},
    async setChecked() {},
    async click(selector, expectation) {
      clicks.push(`${selector}:${expectation.expectedText ?? ''}`);
      submitted = true;
    },
    async upload() {},
    async wait() {},
    async screenshot() { return new Uint8Array(); },
    async scanControls() { return []; },
    async scanActions() {
      if (!submitted) return [action('投递简历')];
      return confirm ? [action('继续沟通')] : [];
    },
    async formStateHash() { return 'a'.repeat(64); },
  };
}

describe('Nowcoder supervised submit contract', () => {
  it('marks review submit-ready only when the exact resume field is deterministically bound and filled', async () => {
    const adapter = new NowcoderAtsSiteAdapter();
    expect(adapter.explicitBindings(resumeForm)).toEqual([
      expect.objectContaining({ fieldId: 'resume', applicantKey: 'documents.resume', confidence: 1, source: 'playbook' }),
    ]);
    await expect(adapter.validate(resumeForm, plan, filledReport)).resolves.toMatchObject({ readyForReview: true, readyForSubmit: true });
    await expect(adapter.validate(resumeForm, plan, { ...filledReport, results: [], filled: 0 })).resolves.toMatchObject({ readyForSubmit: false });
  });

  it('binds only Nowcoder primary jsAttachUpload1 resume slot when the live modal exposes two hidden file inputs', () => {
    const twoFileForm = FormIRSchema.parse({
      ...resumeForm,
      pages: [{ ...resumeForm.pages[0]!, fieldIds: ['resume-primary','resume-secondary'] }],
      fields: [
        { ...resumeForm.fields[0]!, id: 'resume-primary', controlRef: '#resume-primary', semanticHints: ['jsAttachUpload1_1789703006625_4220'] },
        { ...resumeForm.fields[0]!, id: 'resume-secondary', controlRef: '#resume-secondary', semanticHints: ['jsAttachUpload2_1789703006628_7169'] },
      ],
    });
    const adapter = new NowcoderAtsSiteAdapter();
    expect(adapter.explicitBindings(twoFileForm)).toEqual([
      expect.objectContaining({
        fieldId: 'resume-primary',
        applicantKey: 'documents.resume',
        source: 'playbook',
        reason: 'nowcoder-primary-resume-upload-slot',
      }),
    ]);
  });

  it('waits for Nowcoder resume parsing to finish before freezing the ReviewSnapshot form state', async () => {
    const adapter = new NowcoderAtsSiteAdapter();
    const samples = [
      '选择投递简历 大模型正在为您解析简历…',
      '选择投递简历 大模型正在为您解析简历…',
      '选择投递简历 卢楼豪-AI Agent应用开发工程师-ForgeFlow版 投递简历',
      '选择投递简历 卢楼豪-AI Agent应用开发工程师-ForgeFlow版 投递简历',
    ];
    let bodyReads = 0;
    let waits = 0;
    const browser: BrowserDriverPort = {
      ...submitBrowser(false, []),
      async bodyText() {
        const value = samples[Math.min(bodyReads, samples.length - 1)]!;
        bodyReads += 1;
        return value;
      },
      async wait(milliseconds) {
        expect(milliseconds).toBe(500);
        waits += 1;
      },
    };
    await adapter.settleReviewState(browser);
    expect(bodyReads).toBe(4);
    expect(waits).toBe(4);
  });

  it('clicks exactly one final submit action and accepts success only after the characterized continue-contact state appears', async () => {
    const adapter = new NowcoderAtsSiteAdapter();
    const clicks: string[] = [];
    const result = await adapter.submit(submitBrowser(true, clicks));
    expect(clicks).toEqual(['#投递简历:投递简历']);
    expect(result).toMatchObject({ outcome: 'success', evidence: { confirmationAction: '继续沟通', postSubmitState: 'submitted_state' } });
  });

  it('returns uncertain rather than inventing success when the post-submit confirmation state is absent', async () => {
    const adapter = new NowcoderAtsSiteAdapter();
    const result = await adapter.submit(submitBrowser(false, []));
    expect(result).toMatchObject({ outcome: 'uncertain', evidence: { postSubmitState: 'job_detail' } });
  });
});
