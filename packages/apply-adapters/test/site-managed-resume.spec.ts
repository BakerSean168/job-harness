import { describe, expect, it } from 'vitest';
import { FillPlanSchema, FormIRSchema, type ApplyBundleSiteResumeBinding } from '@job-harness/apply-contracts';
import { LiepinAtsSiteAdapter, ZhilianAtsSiteAdapter } from '../src';

const binding: ApplyBundleSiteResumeBinding = {
  id: 'binding-1', siteFamily: 'zhilian', browserAgentId: 'windows-chrome-primary', profileId: 'ai-agent-forgeflow',
  resumeRevisionId: 'rev-1', resumeArtifactId: 'artifact-1', externalResumeLabel: 'AI Agent简历', assurance: 'user-confirmed-label',
  characterizationRunId: 'run-1', characterizationFormStateHash: 'a'.repeat(64), characterizationObservedAt: '2026-09-18T09:30:00.000Z',
};
function form(options = ['请选择','AI Agent简历','前端简历']) {
  return FormIRSchema.parse({
    version: 1, observedAt: '2026-09-18T09:30:00.000Z', source: { adapterId: 'zhilian-ats', adapterVersion: '1', host: 'www.zhaopin.com' },
    pages: [{ id: 'p1', url: 'https://www.zhaopin.com/jobdetail/CC1.htm', title: 'job', sectionIds: [], fieldIds: ['resume'] }], sections: [],
    fields: [{ id: 'resume', pageId: 'p1', sectionId: null, controlRef: '#resume', type: 'select', label: '选择简历', name: 'resumeId', description: '在线简历', required: true, disabled: false, readOnly: false, options: options.map((label) => ({ value: label, label, disabled: false })), semanticHints: ['resume-selector'], sensitivityHint: null, accept: null, multiple: false }],
  });
}
function plan(hasBinding = true) {
  return FillPlanSchema.parse({ version: 1, formVersion: 'f1', catalogVersion: 'c1',
    bindings: hasBinding ? [{ fieldId: 'resume', applicantKey: 'documents.site_resume', confidence: 1, source: 'playbook', reason: 'fixture' }] : [],
    instructions: hasBinding ? [{ fieldId: 'resume', applicantKey: 'documents.site_resume', method: 'select_option', source: 'playbook', confidence: 1 }] : [], pending: [], prohibited: [] });
}

describe('site-managed resume binding adapters', () => {
  it('binds only an exact unique observed site resume label', () => {
    const adapter = new ZhilianAtsSiteAdapter();
    expect(adapter.explicitBindings(form(), { siteResumeBinding: binding })).toEqual([
      expect.objectContaining({ fieldId: 'resume', applicantKey: 'documents.site_resume', confidence: 1, source: 'playbook' }),
    ]);
    expect(adapter.explicitBindings(form(['请选择','前端简历']), { siteResumeBinding: binding })).toEqual([]);
  });

  it('blocks review when the frozen site resume label was not deterministically selected', async () => {
    const adapter = new ZhilianAtsSiteAdapter();
    const missing = await adapter.validate(form(), plan(false), { results: [], filled: 0, skipped: 0, failed: 0, manual: 0 }, { siteResumeBinding: binding });
    expect(missing.readyForReview).toBe(false);
    expect(missing.issues.map((issue) => issue.code)).toContain('site_resume_selector_not_uniquely_bound');
    const filled = await adapter.validate(form(), plan(true), { results: [{ fieldId: 'resume', applicantKey: 'documents.site_resume', status: 'filled', method: 'select_option', detail: null }], filled: 1, skipped: 0, failed: 0, manual: 0 }, { siteResumeBinding: binding });
    expect(filled.readyForReview).toBe(true);
    expect(filled.readyForSubmit).toBe(false);
  });

  it('refuses to apply a Zhilian binding inside the Liepin adapter', async () => {
    const adapter = new LiepinAtsSiteAdapter();
    const result = await adapter.validate(form(), plan(true), { results: [{ fieldId: 'resume', applicantKey: 'documents.site_resume', status: 'filled', method: 'select_option', detail: null }], filled: 1, skipped: 0, failed: 0, manual: 0 }, { siteResumeBinding: binding });
    expect(result.readyForReview).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('site_resume_binding_family_mismatch');
  });
});
