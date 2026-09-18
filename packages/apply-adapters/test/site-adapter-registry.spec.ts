import { describe, expect, it } from 'vitest';
import { ApplicantFieldCatalogSchema, FormIRSchema } from '@job-harness/apply-contracts';
import {
  ApplySiteAdapterRegistry,
  BOSS_OUTREACH_DESCRIPTOR,
  GenericAtsSiteAdapter,
  PlaybookAtsSiteAdapter,
  NowcoderAtsSiteAdapter,
  MokaSocialRecruitmentAtsSiteAdapter,
  ZhilianAtsSiteAdapter,
  LiepinAtsSiteAdapter,
  BossOutreachSiteAdapter,
  BeisenAtsSiteAdapter,
  FeishuJobsAtsSiteAdapter,
  HotJobAtsSiteAdapter,
  ZhiyeAtsSiteAdapter,
  LegacyMokaAtsSiteAdapter,
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



  it('prefers observed site adapters and only promotes the characterized Nowcoder submit contract', () => {
    const registry = new ApplySiteAdapterRegistry([
      new GenericAtsSiteAdapter(),
      new ZhilianAtsSiteAdapter(),
      new LiepinAtsSiteAdapter(),
      new NowcoderAtsSiteAdapter(),
      new MokaSocialRecruitmentAtsSiteAdapter(),
    ]);
    const zhilian = registry.resolve({ url: 'https://www.zhaopin.com/jobdetail/CC000544460J40841560916.htm', semantics: 'formal_application' });
    expect(zhilian?.descriptor).toMatchObject({ id: 'zhilian-ats', capabilities: { submit: false } });
    const liepin = registry.resolve({ url: 'https://www.liepin.com/job/1980814533.shtml', semantics: 'formal_application' });
    expect(liepin?.descriptor).toMatchObject({ id: 'liepin-ats', capabilities: { submit: false } });
    const nowcoder = registry.resolve({ url: 'https://www.nowcoder.com/jobs/detail/457892', semantics: 'formal_application' });
    expect(nowcoder?.descriptor).toMatchObject({ id: 'nowcoder-ats', capabilities: { submit: true } });
    const moka = registry.resolve({ url: 'https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/abc', semantics: 'formal_application' });
    expect(moka?.descriptor).toMatchObject({ id: 'moka-social-recruitment', capabilities: { submit: false } });
  });

  it('restores legacy Copilot ATS host coverage as fill-only adapters without promoting submit authority', () => {
    const registry = new ApplySiteAdapterRegistry([
      new GenericAtsSiteAdapter(),
      new MokaSocialRecruitmentAtsSiteAdapter(),
      new BeisenAtsSiteAdapter(),
      new FeishuJobsAtsSiteAdapter(),
      new HotJobAtsSiteAdapter(),
      new ZhiyeAtsSiteAdapter(),
      new LegacyMokaAtsSiteAdapter(),
    ]);
    const cases = [
      ['https://acme.beisen.com/campus/apply/1', 'beisen-ats'],
      ['https://foo.italentx.com/apply/1', 'beisen-ats'],
      ['https://jobs.feishu.cn/acme/123', 'feishu-jobs-ats'],
      ['https://acme.hotjob.cn/wt/acme/web/index/applyPosition', 'hotjob-ats'],
      ['https://acme.zhiye.com/campus/jobs/1', 'zhiye-ats'],
      ['https://acme.mokahr.com/apply/1', 'legacy-moka-ats'],
    ] as const;
    for (const [url, id] of cases) {
      const adapter = registry.resolve({ url, semantics: 'formal_application' });
      expect(adapter?.descriptor).toMatchObject({ id, capabilities: { fill: true, submit: false } });
    }
    const nativeMoka = registry.resolve({ url: 'https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/abc', semantics: 'formal_application' });
    expect(nativeMoka?.descriptor.id).toBe('moka-social-recruitment');
  });

  it('keeps BOSS greeting/outreach semantics outside formal application submission', () => {
    expect(BOSS_OUTREACH_DESCRIPTOR).toMatchObject({ semantics: 'outreach', capabilities: { submit: false } });
    const registry = new ApplySiteAdapterRegistry([new GenericAtsSiteAdapter(), new BossOutreachSiteAdapter()]);
    expect(registry.resolve({ url: 'https://www.zhipin.com/job_detail/example.html', semantics: 'outreach' })?.descriptor.id).toBe('boss-outreach');
    expect(registry.resolve({ url: 'https://www.zhipin.com/job_detail/example.html', semantics: 'formal_application' })?.descriptor.id).toBe('generic-ats');
  });
});

describe('submit eligibility is adapter-specific', () => {
  it('never marks the generic fallback ready for submit even when all deterministic fields are satisfied', async () => {
    const adapter = new GenericAtsSiteAdapter();
    const plan = {
      version: 1 as const,
      formVersion: 'fixture-form-v1',
      catalogVersion: 'fixture-v1',
      bindings: [
        { fieldId: 'name', applicantKey: 'person.full_name', confidence: 1, source: 'rule' as const, reason: 'fixture' },
        { fieldId: 'email', applicantKey: 'contact.email', confidence: 1, source: 'rule' as const, reason: 'fixture' },
      ],
      instructions: [
        { fieldId: 'name', applicantKey: 'person.full_name', method: 'set_text' as const, source: 'rule' as const, confidence: 1 },
        { fieldId: 'email', applicantKey: 'contact.email', method: 'set_text' as const, source: 'rule' as const, confidence: 1 },
      ],
      pending: [],
      prohibited: [],
    };
    const report = await adapter.validate(form, plan, { results: [], filled: 2, skipped: 0, failed: 0, manual: 0 });
    expect(report.readyForReview).toBe(true);
    expect(report.readyForSubmit).toBe(false);
  });
});
