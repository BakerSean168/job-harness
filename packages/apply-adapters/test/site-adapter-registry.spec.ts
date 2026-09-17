import { describe, expect, it } from 'vitest';
import { ApplicantFieldCatalogSchema, FormIRSchema } from '@job-harness/apply-contracts';
import {
  ApplySiteAdapterRegistry,
  BOSS_OUTREACH_DESCRIPTOR,
  GenericAtsSiteAdapter,
  PlaybookAtsSiteAdapter,
} from '../src';

const form = FormIRSchema.parse({
  version: 1,
  observedAt: '2026-09-17T12:00:00.000Z',
  source: { adapterId: 'fixture', adapterVersion: '1', host: 'jobs.fixture.test' },
  pages: [{ id: 'page-1', url: 'https://jobs.fixture.test/apply/123', title: 'Apply', sectionIds: [], fieldIds: ['name','email'] }],
  sections: [],
  fields: [
    { id: 'name', pageId: 'page-1', controlRef: '#name', type: 'text', label: 'Candidate Name', name: 'fullName', required: true },
    { id: 'email', pageId: 'page-1', controlRef: '#email', type: 'email', label: 'Email', name: 'email', required: true },
  ],
});
const catalog = ApplicantFieldCatalogSchema.parse({
  version: 'fixture-v1',
  entries: [
    { key: 'person.full_name', label: '姓名', valueType: 'text', sensitivity: 'personal', aliases: ['name'], allowAiMapping: false, requiresLiteral: true, source: 'fixture' },
    { key: 'contact.email', label: '邮箱', valueType: 'email', sensitivity: 'sensitive', aliases: ['email'], allowAiMapping: false, requiresLiteral: true, source: 'fixture' },
  ],
});

describe('ApplySiteAdapter registry and declarative playbooks', () => {
  it('selects a narrow versioned playbook ahead of the generic fallback without coupling browser infrastructure to the ATS', () => {
    const playbook = new PlaybookAtsSiteAdapter({
      id: 'fixture-ats', version: '2026-09-17.1', hosts: ['jobs.fixture.test'], pathPrefixes: ['/apply/'],
      fieldRules: [
        { applicantKey: 'person.full_name', labelEquals: ['Candidate Name'], nameEquals: ['fullName'] },
        { applicantKey: 'contact.email', labelEquals: ['Email'], nameEquals: ['email'] },
      ],
    });
    const registry = new ApplySiteAdapterRegistry([new GenericAtsSiteAdapter(), playbook]);
    expect(registry.resolve({ url: 'https://jobs.fixture.test/apply/123', semantics: 'formal_application' })?.descriptor.id)
      .toBe('playbook:fixture-ats');
    expect(registry.resolve({ url: 'https://other.example/apply', semantics: 'formal_application' })?.descriptor.id)
      .toBe('generic-ats');
    expect(registry.resolve({ url: 'https://jobs.fixture.test/jobs/123', semantics: 'formal_application', requiredAdapterId: 'playbook:fixture-ats' }))
      .toBeNull();
  });

  it('turns playbook rules into explicit bindings while still using the common deterministic FillPlan core', () => {
    const playbook = new PlaybookAtsSiteAdapter({
      id: 'fixture-ats', version: '1', hosts: ['jobs.fixture.test'],
      fieldRules: [
        { applicantKey: 'person.full_name', labelEquals: ['Candidate Name'] },
        { applicantKey: 'contact.email', nameEquals: ['email'] },
      ],
    });
    expect(playbook.explicitBindings(form)).toEqual([
      expect.objectContaining({ fieldId: 'name', applicantKey: 'person.full_name', source: 'playbook', confidence: 1 }),
      expect.objectContaining({ fieldId: 'email', applicantKey: 'contact.email', source: 'playbook', confidence: 1 }),
    ]);
    const plan = playbook.buildPlan(form, catalog);
    expect(plan.instructions).toHaveLength(2);
    expect(plan.pending).toHaveLength(0);
  });

  it('keeps BOSS greeting/outreach semantics outside formal application submission', () => {
    expect(BOSS_OUTREACH_DESCRIPTOR).toMatchObject({ semantics: 'outreach', capabilities: { submit: false } });
    expect(BOSS_OUTREACH_DESCRIPTOR.semantics).not.toBe('formal_application');
  });
});
