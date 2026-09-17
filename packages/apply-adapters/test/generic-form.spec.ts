import { describe, expect, it } from 'vitest';
import { buildFillPlan } from '@job-harness/apply-core';
import type { BrowserControlSnapshot, BrowserDriverPort } from '@job-harness/apply-browser';
import { InMemoryApplicantDataProvider, browserControlsToFormIr, fillGenericForm } from '../src';

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
      async wait() {}, async screenshot() { return new Uint8Array(); }, async scanControls() { return controls; },
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
