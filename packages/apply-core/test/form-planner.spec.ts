import { describe, expect, it } from 'vitest';
import { ApplicantFieldCatalogSchema, FormIRSchema } from '@job-harness/apply-contracts';
import { buildFillPlan, buildSemanticMappingView } from '../src';

const catalog = ApplicantFieldCatalogSchema.parse({
  version: 'fixture-v1',
  entries: [
    { key: 'person.full_name', label: '姓名', valueType: 'text', sensitivity: 'personal', aliases: ['姓名','名字','name','full name'], allowAiMapping: false, requiresLiteral: true, source: 'fixture' },
    { key: 'contact.email', label: '邮箱', valueType: 'email', sensitivity: 'sensitive', aliases: ['邮箱','电子邮箱','email','e-mail'], allowAiMapping: false, requiresLiteral: true, source: 'fixture' },
    { key: 'contact.phone', label: '电话', valueType: 'phone', sensitivity: 'sensitive', aliases: ['电话','手机','手机号','phone','mobile'], allowAiMapping: false, requiresLiteral: true, source: 'fixture' },
    { key: 'education[0].school', label: '学校', valueType: 'text', sensitivity: 'personal', aliases: ['学校','院校','毕业院校','university','school'], allowAiMapping: true, requiresLiteral: true, source: 'fixture' },
    { key: 'education[0].major', label: '专业', valueType: 'text', sensitivity: 'personal', aliases: ['专业','major'], allowAiMapping: true, requiresLiteral: true, source: 'fixture' },
    { key: 'legal.work_authorized', label: '工作许可', valueType: 'boolean', sensitivity: 'legal', aliases: ['工作许可','是否有工作许可','work authorization'], allowAiMapping: false, requiresLiteral: true, source: 'fixture' },
  ],
});

const form = FormIRSchema.parse({
  version: 1,
  observedAt: '2026-09-17T10:00:00.000Z',
  source: { adapterId: 'generic', adapterVersion: '1.0.0', host: 'jobs.example.com' },
  pages: [{ id: 'page-1', url: 'https://jobs.example.com/apply', title: 'Apply', sectionIds: [], fieldIds: ['name','email','phone','school','major','visa','mystery'] }],
  sections: [],
  fields: [
    { id: 'name', pageId: 'page-1', controlRef: '#name', type: 'text', label: '姓名', required: true },
    { id: 'email', pageId: 'page-1', controlRef: '#email', type: 'email', label: 'Email', required: true },
    { id: 'phone', pageId: 'page-1', controlRef: '#phone', type: 'tel', label: '手机号码', required: true },
    { id: 'school', pageId: 'page-1', controlRef: '#school', type: 'text', label: '毕业院校', required: true },
    { id: 'major', pageId: 'page-1', controlRef: '#major', type: 'text', label: '所学专业', required: true },
    { id: 'visa', pageId: 'page-1', controlRef: '#visa', type: 'radio', label: 'Will you now or in the future require visa sponsorship?', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
    { id: 'mystery', pageId: 'page-1', controlRef: '#mystery', type: 'text', label: 'Favorite editor theme', required: false },
  ],
});

describe('DOM-free FormIR planner', () => {
  it('binds deterministic known fields and refuses to infer unknown legal answers', () => {
    const plan = buildFillPlan(form, catalog);
    const byField = new Map(plan.bindings.map((binding) => [binding.fieldId, binding]));
    expect(byField.get('name')?.applicantKey).toBe('person.full_name');
    expect(byField.get('email')?.applicantKey).toBe('contact.email');
    expect(byField.get('phone')?.applicantKey).toBe('contact.phone');
    expect(byField.get('school')?.applicantKey).toBe('education[0].school');
    expect(byField.get('major')?.applicantKey).toBe('education[0].major');
    expect(byField.has('visa')).toBe(false);
    expect(plan.pending).toContainEqual(expect.objectContaining({ fieldId: 'visa', required: true, reason: 'sensitive_field_requires_explicit_literal_binding' }));
    expect(plan.pending).toContainEqual(expect.objectContaining({ fieldId: 'mystery', required: false, reason: 'optional_field_unmapped' }));
  });

  it('accepts bounded semantic proposals only for catalog keys that explicitly allow AI mapping', () => {
    const renamed = FormIRSchema.parse({
      ...form,
      pages: [{ ...form.pages[0], fieldIds: ['school','email'] }],
      fields: [
        { ...form.fields.find((field) => field.id === 'school')!, label: 'Academic institution name', semanticHints: [] },
        { ...form.fields.find((field) => field.id === 'email')!, label: 'Preferred digital contact', semanticHints: [] },
      ],
    });
    const plan = buildFillPlan(renamed, catalog, { semanticProposals: [
      { fieldId: 'school', applicantKey: 'education[0].school', confidence: 0.97, reason: 'institution field' },
      { fieldId: 'email', applicantKey: 'contact.email', confidence: 0.99, reason: 'contact field' },
    ] });
    expect(plan.bindings).toContainEqual(expect.objectContaining({ fieldId: 'school', source: 'semantic' }));
    expect(plan.bindings.some((binding) => binding.fieldId === 'email' && binding.source === 'semantic')).toBe(false);
  });

  it('builds an AI mapping view that contains field/catalog metadata but no applicant values', () => {
    const view = buildSemanticMappingView(form, catalog);
    const json = JSON.stringify(view);
    expect(json).toContain('person.full_name');
    expect(json).toContain('Will you now or in the future require visa sponsorship?');
    expect(json).not.toContain('resolvedValue');
    expect(Object.keys(view.catalog[0]!)).not.toContain('value');
  });
});
