import { describe, expect, it } from 'vitest';
import { buildFillPlan } from '@job-harness/apply-core';
import type { BrowserControlSnapshot, BrowserDriverPort } from '@job-harness/apply-browser';
import { GenericAtsSiteAdapter, InMemoryApplicantDataProvider, browserControlsToFormIr, fillGenericForm } from '../src';

const controls: BrowserControlSnapshot[] = [
  { controlRef: '#name', kind: 'text', label: '姓名', name: 'name', description: null, required: true, disabled: false, readOnly: false, options: [], semanticHints: ['name'], accept: null, multiple: false, sectionLabel: '基本信息' },
  { controlRef: '#email', kind: 'email', label: '电子邮箱', name: 'email', description: null, required: true, disabled: false, readOnly: false, options: [], semanticHints: ['email'], accept: null, multiple: false, sectionLabel: '基本信息' },
  { controlRef: '#degree', kind: 'select', label: '最高学历', name: 'degree', description: null, required: true, disabled: false, readOnly: false, options: [{ value: 'bachelor', label: '本科', disabled: false }, { value: 'master', label: '硕士', disabled: false }], semanticHints: [], accept: null, multiple: false, sectionLabel: '教育经历' },
  { controlRef: '#visa', kind: 'radio', label: '是否需要工作签证 sponsorship', name: 'visa', description: null, required: true, disabled: false, readOnly: false, options: [{ value: 'yes', label: '是', disabled: false }, { value: 'no', label: '否', disabled: false }], semanticHints: [], accept: null, multiple: false, sectionLabel: '合规' },
];

const provider = new InMemoryApplicantDataProvider('fixture-v1', [
  { entry: { key: 'person.full_name', label: '姓名', valueType: 'text', sensitivity: 'personal', aliases: ['姓名','name'], allowAiMapping: false, requiresLiteral: true, source: 'fixture' }, value: 'Fixture User', provenance: 'fixture' },
  { entry: { key: 'contact.email', label: '邮箱', valueType: 'email', sensitivity: 'sensitive', aliases: ['邮箱','电子邮箱','email'], allowAiMapping: false, requiresLiteral: true, source: 'fixture' }, value: 'fixture@example.test', provenance: 'fixture' },
  { entry: { key: 'education.highest_degree', label: '最高学历', valueType: 'choice', sensitivity: 'personal', aliases: ['最高学历','学历'], allowAiMapping: false, requiresLiteral: true, source: 'fixture' }, value: '本科', provenance: 'fixture' },
]);

describe('generic deterministic form adapter', () => {
  it('turns browser-only control metadata into canonical FormIR with sensitive hints', () => {
    const form = browserControlsToFormIr({
      url: 'https://jobs.example.test/apply', title: 'Apply', observedAt: '2026-09-17T10:00:00.000Z', controls,
    });
    expect(form.sections.map((section) => section.title)).toEqual(['基本信息', '教育经历', '合规']);
    expect(form.fields.find((field) => field.controlRef === '#visa')?.sensitivityHint).toBe('legal');
    expect(form.fields.every((field) => !('value' in field))).toBe(true);
  });

  it('fills a file-only application form without resolving an empty applicant-data key set', async () => {
    const fileControls: BrowserControlSnapshot[] = [
      { controlRef: '#resume', kind: 'file', label: '简历', name: 'resume', description: null, required: true, disabled: false, readOnly: false, options: [], semanticHints: ['resume'], accept: 'application/pdf,.pdf', multiple: false, sectionLabel: '选择投递简历' },
    ];
    const form = browserControlsToFormIr({
      url: 'https://www.nowcoder.com/jobs/detail/463747',
      title: 'Agent开发工程师',
      observedAt: '2026-09-18T03:40:00.000Z',
      controls: fileControls,
    });
    const fieldId = form.fields[0]!.id;
    const plan = {
      version: 1 as const,
      formVersion: 'file-only-form-v1',
      catalogVersion: 'file-only-catalog-v1',
      bindings: [{ fieldId, applicantKey: 'documents.resume', confidence: 1, source: 'playbook' as const, reason: 'fixture' }],
      instructions: [{ fieldId, applicantKey: 'documents.resume', method: 'attach_file' as const, source: 'playbook' as const, confidence: 1 }],
      pending: [],
      prohibited: [],
    };
    let resolveCalls = 0;
    const uploads: string[] = [];
    const applicant = {
      async catalog() { throw new Error('catalog is not used by fillGenericForm'); },
      async resolve() { resolveCalls += 1; throw new Error('file-only fill must not resolve applicant literals'); },
    };
    const browser: BrowserDriverPort = {
      async navigate() {}, currentUrl: () => 'https://www.nowcoder.com/jobs/detail/463747', async title() { return 'Agent开发工程师'; }, async bodyText() { return ''; },
      async exists() { return true; }, async text() { return null; }, async fill() {}, async select() {}, async setChecked() {}, async click() {},
      async upload(selector, file) { uploads.push(`${selector}:${file.name}:${file.sha256 ?? ''}`); },
      async wait() {}, async screenshot() { return new Uint8Array(); }, async scanActions() { return []; }, async scanControls() { return fileControls; }, async formStateHash() { return 'a'.repeat(64); },
    };
    const report = await fillGenericForm(browser, form, plan, applicant, {
      resumeFile: { name: 'forgeflow.pdf', mimeType: 'application/pdf', bytes: new Uint8Array([1,2,3]), sha256: 'b'.repeat(64) },
    });
    expect(resolveCalls).toBe(0);
    expect(report).toMatchObject({ filled: 1, failed: 0, manual: 0 });
    expect(uploads).toEqual([expect.stringContaining('forgeflow.pdf')]);
  });

  it('fills literal mapped values through BrowserDriverPort and leaves unknown legal fields untouched', async () => {
    const form = browserControlsToFormIr({
      url: 'https://jobs.example.test/apply', title: 'Apply', observedAt: '2026-09-17T10:00:00.000Z', controls,
    });
    const catalog = await provider.catalog();
    const plan = buildFillPlan(form, catalog);
    const writes: string[] = [];
    const browser: BrowserDriverPort = {
      async navigate() {}, currentUrl: () => 'https://jobs.example.test/apply', async title() { return 'Apply'; }, async bodyText() { return ''; },
      async exists() { return true; }, async text() { return null; },
      async fill(selector, value) { writes.push(`fill:${selector}:${value}`); },
      async select(selector, value) { writes.push(`select:${selector}:${Array.isArray(value) ? value.join(',') : value}`); },
      async setChecked(selector, checked) { writes.push(`check:${selector}:${checked}`); },
      async click() { throw new Error('submit/click must not be used by fillGenericForm'); },
      async upload() { throw new Error('artifact grant is not implemented in this slice'); },
      async wait() {}, async screenshot() { return new Uint8Array(); }, async scanActions() { return []; }, async scanControls() { return controls; }, async formStateHash() { return 'a'.repeat(64); },
    };
    const report = await fillGenericForm(browser, form, plan, provider);
    expect(report.filled).toBe(3);
    expect(report.failed).toBe(0);
    expect(writes).toContain('fill:#name:Fixture User');
    expect(writes).toContain('fill:#email:fixture@example.test');
    expect(writes).toContain('select:#degree:bachelor');
    expect(writes.some((item) => item.includes('#visa'))).toBe(false);
    expect(plan.pending).toContainEqual(expect.objectContaining({ fieldId: expect.any(String), reason: 'sensitive_field_requires_explicit_literal_binding' }));
  });
});

describe('generic ATS surface safety', () => {
  it('blocks sparse job-detail/search surfaces from becoming review-ready', async () => {
    const adapter = new GenericAtsSiteAdapter();
    const sparse = browserControlsToFormIr({
      url: 'https://jobs.example.test/job/123',
      title: 'Job detail',
      observedAt: '2026-09-17T12:00:00.000Z',
      controls: [{ controlRef: '#search', kind: 'text', label: '输入职位关键字', name: 'keyword', description: null, required: false, disabled: false, readOnly: false, options: [], semanticHints: ['keyword'], accept: null, multiple: false, sectionLabel: null }],
    });
    const report = await adapter.validate(sparse, { version: 1, formVersion: 'sparse', catalogVersion: 'fixture-v1', bindings: [], instructions: [], pending: [], prohibited: [] }, null);
    expect(report.readyForReview).toBe(false);
    expect(report.readyForSubmit).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'application_form_not_detected', severity: 'blocking' }));
  });

  it('does not write applicant values into login/verification surfaces', async () => {
    const adapter = new GenericAtsSiteAdapter();
    const authControls: BrowserControlSnapshot[] = [
      { controlRef: '#phone', kind: 'text', label: '请输入手机号码', name: 'phone', description: null, required: false, disabled: false, readOnly: false, options: [], semanticHints: ['phone'], accept: null, multiple: false, sectionLabel: '登录 / 注册' },
      { controlRef: '#code', kind: 'text', label: '请输入验证码', name: 'code', description: null, required: false, disabled: false, readOnly: false, options: [], semanticHints: ['verification-code'], accept: null, multiple: false, sectionLabel: '登录 / 注册' },
    ];
    const form = browserControlsToFormIr({ url: 'https://jobs.example.test/job/123', title: 'Login', observedAt: '2026-09-17T12:00:00.000Z', controls: authControls });
    const authProvider = new InMemoryApplicantDataProvider('auth-fixture-v1', [
      { entry: { key: 'contact.phone', label: '手机', valueType: 'phone', sensitivity: 'sensitive', aliases: ['手机号码','phone'], allowAiMapping: false, requiresLiteral: true, source: 'fixture' }, value: '13800000000', provenance: 'fixture' },
    ]);
    const plan = buildFillPlan(form, await authProvider.catalog());
    const writes: string[] = [];
    const browser: BrowserDriverPort = {
      async navigate() {}, currentUrl: () => 'https://jobs.example.test/job/123', async title() { return 'Login'; }, async bodyText() { return ''; },
      async exists() { return true; }, async text() { return null; }, async fill(selector, value) { writes.push(`fill:${selector}:${value}`); }, async select() {}, async setChecked() {}, async click() {}, async upload() {}, async wait() {}, async screenshot() { return new Uint8Array(); }, async scanActions() { return []; }, async scanControls() { return authControls; }, async formStateHash() { return 'a'.repeat(64); },
    };
    const fill = await adapter.fill(browser, form, plan, authProvider);
    const validation = await adapter.validate(form, plan, fill);
    expect(writes).toEqual([]);
    expect(fill.filled).toBe(0);
    expect(validation.readyForReview).toBe(false);
    expect(validation.issues).toContainEqual(expect.objectContaining({ code: 'authentication_surface_detected', severity: 'blocking' }));
  });
});
