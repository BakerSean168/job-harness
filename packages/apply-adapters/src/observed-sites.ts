import type { FieldBinding, FillPlan, FillReport, FormIR } from '@job-harness/apply-contracts';
import type { BrowserDriverPort } from '@job-harness/apply-browser';
import { fillGenericForm, inspectGenericForm } from './generic-form';
import type { ApplicantDataProviderPort } from './applicant-data';
import { inspectApplyPagePreflight } from './page-preflight';
import { GenericAtsSiteAdapter } from './generic-site-adapter';
import { ApplySiteAdapterRegistry, type ApplyApplicationEntryResult, type ApplyFillAssets, type ApplySiteAdapter, type ApplySiteBindingContext, type ApplySiteSubmitResult } from './site-adapter';

abstract class ObservedPublicAtsAdapter implements ApplySiteAdapter {
  abstract readonly descriptor: ApplySiteAdapter['descriptor'];
  private readonly generic = new GenericAtsSiteAdapter();

  abstract probe(input: { url: string }): ReturnType<ApplySiteAdapter['probe']>;

  preflight(browser: BrowserDriverPort) {
    return inspectApplyPagePreflight(browser);
  }

  inspect(browser: BrowserDriverPort, input: { url: string; title?: string | null; observedAt: string }): Promise<FormIR> {
    return inspectGenericForm(browser, { ...input, adapterId: this.descriptor.id, adapterVersion: this.descriptor.version });
  }

  fill(browser: BrowserDriverPort, form: FormIR, plan: FillPlan, applicant: ApplicantDataProviderPort, assets?: ApplyFillAssets): Promise<FillReport> {
    return fillGenericForm(browser, form, plan, applicant, assets);
  }

  async validate(form: FormIR, plan: FillPlan, fillReport?: FillReport | null) {
    const validation = await this.generic.validate(form, plan, fillReport);
    return { ...validation, readyForSubmit: false };
  }
}

export class NowcoderAtsSiteAdapter extends ObservedPublicAtsAdapter {
  readonly descriptor = {
    id: 'nowcoder-ats',
    version: '2026-09-18.5',
    semantics: 'formal_application' as const,
    priority: 180,
    capabilities: { inspect: true, enter: true, fill: true, validate: true, submit: true },
  };

  probe(input: { url: string }) {
    try {
      const url = new URL(input.url);
      const supported = (url.hostname === 'www.nowcoder.com' || url.hostname === 'nowcoder.com')
        && /^\/jobs\/detail\//.test(url.pathname);
      return { supported, score: supported ? 0.99 : 0, reason: supported ? 'nowcoder-job-detail-family' : 'nowcoder-mismatch' };
    } catch {
      return { supported: false, score: 0, reason: 'invalid-url' };
    }
  }

  async enterApplication(browser: BrowserDriverPort, preflight: Awaited<ReturnType<typeof inspectApplyPagePreflight>>): Promise<ApplyApplicationEntryResult> {
    if (preflight.state !== 'job_detail') throw new Error(`Nowcoder application entry requires job_detail preflight, got '${preflight.state}'`);
    const actions = (await browser.scanActions())
      .filter((action) => !action.disabled && !action.ariaDisabled && action.text.replace(/\s+/g, ' ').trim() === '立即申请');
    if (actions.length !== 1) throw new Error(`Nowcoder application entry requires exactly one enabled '立即申请' action, found ${actions.length}`);
    const action = actions[0]!;
    await browser.click(action.actionRef, { expectedText: '立即申请' });
    await browser.wait(1200);
    let after = await inspectApplyPagePreflight(browser);
    if (!after.canInspectForm && after.state === 'job_detail') {
      const controls = await browser.scanControls();
      const resumeControls = controls.filter((control) => isNowcoderResumeControl(control));
      if (resumeControls.length === 1) {
        after = {
          ...after,
          state: 'application_form',
          canInspectForm: true,
          reasonCode: 'application_form_detected',
          summary: 'Nowcoder application modal with one resume document input was detected after the characterized entry action.',
          evidence: {
            ...after.evidence,
            controlCount: controls.length,
            controlKinds: [...new Set(controls.map((control) => control.kind))].sort(),
          },
        };
      }
    }
    return {
      action: { text: '立即申请', tag: action.tag, href: action.href },
      beforeState: preflight.state,
      after,
      navigationActionCount: 1,
    };
  }

  async settleReviewState(browser: BrowserDriverPort): Promise<void> {
    // Nowcoder uploads/parses the selected resume asynchronously and may rebuild
    // its hidden file inputs while the parser is active. ReviewSnapshot must bind
    // the post-parser stable form state, not that transient DOM/FileList.
    let parserSeen = false;
    let stableAbsentSamples = 0;
    for (let sample = 0; sample < 30; sample += 1) {
      await browser.wait(500);
      const body = await browser.bodyText();
      const parsing = /大模型正在为您解析简历/.test(body);
      if (parsing) {
        parserSeen = true;
        stableAbsentSamples = 0;
        continue;
      }
      stableAbsentSamples += 1;
      if (stableAbsentSamples >= (parserSeen ? 2 : 4)) return;
    }
    throw new Error('Nowcoder resume parser did not reach a stable post-upload state before review');
  }

  explicitBindings(form: FormIR): readonly FieldBinding[] {
    const primaryResumeFields = form.fields.filter((field) => isNowcoderPrimaryResumeField(field));
    const resumeFields = form.fields.filter((field) => isNowcoderResumeField(field));
    const target = primaryResumeFields.length === 1
      ? primaryResumeFields[0]
      : resumeFields.length === 1 ? resumeFields[0] : null;
    if (!target) return [];
    return [{
      fieldId: target.id,
      applicantKey: 'documents.resume',
      confidence: 1,
      source: 'playbook',
      reason: primaryResumeFields.length === 1
        ? 'nowcoder-primary-resume-upload-slot'
        : 'nowcoder-application-modal-single-resume-document-input',
    }];
  }

  async validate(form: FormIR, plan: FillPlan, fillReport?: FillReport | null) {
    const validation = await super.validate(form, plan, fillReport);
    const explicit = this.explicitBindings(form);
    const resumeBinding = plan.bindings.filter((binding) => binding.applicantKey === 'documents.resume');
    const resumeResult = fillReport?.results.find((result) => result.applicantKey === 'documents.resume') ?? null;
    const exactResumeAttached = explicit.length === 1
      && resumeBinding.length === 1
      && resumeBinding[0]!.fieldId === explicit[0]!.fieldId
      && resumeResult?.fieldId === explicit[0]!.fieldId
      && resumeResult.status === 'filled';
    return { ...validation, readyForSubmit: validation.readyForReview && exactResumeAttached };
  }

  async submit(browser: BrowserDriverPort): Promise<ApplySiteSubmitResult> {
    const actions = (await browser.scanActions())
      .filter((action) => !action.disabled && !action.ariaDisabled && action.text.replace(/\s+/g, ' ').trim() === '投递简历');
    if (actions.length !== 1) throw new Error(`Nowcoder submit requires exactly one enabled '投递简历' action, found ${actions.length}`);

    const appliedAt = new Date().toISOString();
    await browser.click(actions[0]!.actionRef, { expectedText: '投递简历' });
    let lastPreflight = await inspectApplyPagePreflight(browser);
    let confirmationAction: string | null = null;
    for (const delay of [1000, 1500, 2500]) {
      if (lastPreflight.state === 'submitted_state') break;
      await browser.wait(delay);
      lastPreflight = await inspectApplyPagePreflight(browser);
    }
    if (lastPreflight.state === 'submitted_state') {
      const postActions = await browser.scanActions();
      confirmationAction = postActions
        .map((action) => action.text.replace(/\s+/g, ' ').trim())
        .find((text) => text === '继续沟通' || text === '已投递' || text === '已申请') ?? null;
    }
    const confirmedAt = new Date().toISOString();
    const liveUrl = await browser.refreshCurrentUrl();
    const path = new URL(liveUrl).pathname.slice(0, 1000);
    if (lastPreflight.state === 'submitted_state' && confirmationAction) {
      return {
        outcome: 'success',
        appliedAt,
        confirmedAt,
        externalReference: null,
        evidence: {
          site: 'nowcoder',
          siteAdapterId: this.descriptor.id,
          siteAdapterVersion: this.descriptor.version,
          confirmationAction,
          observedPath: path,
          postSubmitState: lastPreflight.state,
        },
        error: null,
      };
    }
    return {
      outcome: 'uncertain',
      appliedAt,
      confirmedAt,
      externalReference: null,
      evidence: {
        site: 'nowcoder',
        siteAdapterId: this.descriptor.id,
        siteAdapterVersion: this.descriptor.version,
        confirmationAction,
        observedPath: path,
        postSubmitState: lastPreflight.state,
        preflightReasonCode: lastPreflight.reasonCode,
      },
      error: 'Nowcoder submit click completed but the characterized existing-application confirmation state was not observed',
    };
  }
}

function isNowcoderResumeControl(control: { kind: string; label: string; name: string | null; semanticHints: readonly string[]; accept: string | null }): boolean {
  if (control.kind !== 'file') return false;
  const evidence = [control.label, control.name ?? '', ...control.semanticHints, control.accept ?? ''].join(' ');
  return /pdf|docx?|resume|cv|upload|file|简历|附件/i.test(evidence);
}

function isNowcoderPrimaryResumeField(field: FormIR['fields'][number]): boolean {
  if (field.type !== 'file') return false;
  return field.semanticHints.some((hint) => /^jsAttachUpload1_/i.test(hint));
}

function isNowcoderResumeField(field: FormIR['fields'][number]): boolean {
  if (field.type !== 'file') return false;
  const evidence = [field.label, field.name ?? '', ...field.semanticHints, field.accept ?? ''].join(' ');
  return /pdf|docx?|resume|cv|upload|file|简历|附件/i.test(evidence);
}

function managedSiteResumeBindings(
  form: FormIR,
  context: ApplySiteBindingContext | undefined,
  family: 'zhilian' | 'liepin',
): readonly FieldBinding[] {
  const binding = context?.siteResumeBinding;
  if (!binding || binding.siteFamily !== family) return [];
  const normalizedLabel = binding.externalResumeLabel.replace(/\s+/g, ' ').trim().toLowerCase();
  const candidates = form.fields.filter((field) => {
    if (field.type !== 'select' && field.type !== 'radio') return false;
    const evidence = [field.label, field.name ?? '', field.description ?? '', ...field.semanticHints].join(' ');
    if (!/简历|resume/i.test(evidence)) return false;
    return field.options.some((option) => !option.disabled && option.label.replace(/\s+/g, ' ').trim().toLowerCase() === normalizedLabel);
  });
  if (candidates.length !== 1) return [];
  return [{
    fieldId: candidates[0]!.id,
    applicantKey: 'documents.site_resume',
    confidence: 1,
    source: 'playbook',
    reason: `${family}-user-confirmed-site-resume-binding`,
  }];
}

async function validateManagedSiteResume(
  base: Awaited<ReturnType<ObservedPublicAtsAdapter['validate']>>,
  plan: FillPlan,
  fillReport: FillReport | null | undefined,
  context: ApplySiteBindingContext | undefined,
  family: 'zhilian' | 'liepin',
  submitCapable: boolean,
) {
  const binding = context?.siteResumeBinding;
  if (!binding) return base;
  const issues = [...base.issues];
  if (binding.siteFamily !== family) {
    issues.push({ code: 'site_resume_binding_family_mismatch', severity: 'blocking' as const, fieldId: null, summary: `Frozen site resume binding belongs to '${binding.siteFamily}', not '${family}'` });
  } else {
    const bound = plan.bindings.filter((item) => item.applicantKey === 'documents.site_resume');
    const result = fillReport?.results.filter((item) => item.applicantKey === 'documents.site_resume') ?? [];
    if (bound.length !== 1) {
      issues.push({ code: 'site_resume_selector_not_uniquely_bound', severity: 'blocking' as const, fieldId: null, summary: `Exactly one resume selector must expose the frozen label '${binding.externalResumeLabel}'` });
    } else if (result.length !== 1 || result[0]!.status !== 'filled') {
      issues.push({ code: 'site_resume_selection_not_confirmed', severity: 'blocking' as const, fieldId: bound[0]!.fieldId, summary: `The frozen site resume label '${binding.externalResumeLabel}' was not deterministically selected` });
    }
  }
  const readyForReview = !issues.some((issue) => issue.severity === 'blocking');
  return { readyForReview, readyForSubmit: submitCapable && readyForReview, issues };
}

export class ZhilianAtsSiteAdapter extends ObservedPublicAtsAdapter {
  readonly descriptor = {
    id: 'zhilian-ats',
    version: '2026-09-18.2',
    semantics: 'formal_application' as const,
    priority: 195,
    capabilities: { inspect: true, enter: false, fill: true, validate: true, submit: false },
  };

  probe(input: { url: string }) {
    try {
      const url = new URL(input.url);
      const supported = (url.hostname === 'www.zhaopin.com' || url.hostname === 'zhaopin.com')
        && /^\/jobdetail\/[^/]+\.htm$/i.test(url.pathname);
      return { supported, score: supported ? 0.995 : 0, reason: supported ? 'zhilian-job-detail-family' : 'zhilian-mismatch' };
    } catch {
      return { supported: false, score: 0, reason: 'invalid-url' };
    }
  }

  explicitBindings(form: FormIR, context?: ApplySiteBindingContext): readonly FieldBinding[] {
    return managedSiteResumeBindings(form, context, 'zhilian');
  }

  async validate(form: FormIR, plan: FillPlan, fillReport?: FillReport | null, context?: ApplySiteBindingContext) {
    const base = await super.validate(form, plan, fillReport);
    return validateManagedSiteResume(base, plan, fillReport, context, 'zhilian', this.descriptor.capabilities.submit);
  }
}

export class LiepinAtsSiteAdapter extends ObservedPublicAtsAdapter {
  readonly descriptor = {
    id: 'liepin-ats',
    version: '2026-09-18.1',
    semantics: 'formal_application' as const,
    priority: 190,
    capabilities: { inspect: true, enter: false, fill: true, validate: true, submit: false },
  };

  probe(input: { url: string }) {
    try {
      const url = new URL(input.url);
      const supported = (url.hostname === 'www.liepin.com' || url.hostname === 'liepin.com')
        && /^\/job\/\d+\.shtml$/i.test(url.pathname);
      return { supported, score: supported ? 0.994 : 0, reason: supported ? 'liepin-job-detail-family' : 'liepin-mismatch' };
    } catch {
      return { supported: false, score: 0, reason: 'invalid-url' };
    }
  }

  explicitBindings(form: FormIR, context?: ApplySiteBindingContext): readonly FieldBinding[] {
    return managedSiteResumeBindings(form, context, 'liepin');
  }

  async validate(form: FormIR, plan: FillPlan, fillReport?: FillReport | null, context?: ApplySiteBindingContext) {
    const base = await super.validate(form, plan, fillReport);
    return validateManagedSiteResume(base, plan, fillReport, context, 'liepin', this.descriptor.capabilities.submit);
  }
}

export class MokaSocialRecruitmentAtsSiteAdapter extends ObservedPublicAtsAdapter {
  readonly descriptor = {
    id: 'moka-social-recruitment',
    version: '2026-09-17.1',
    semantics: 'formal_application' as const,
    priority: 170,
    capabilities: { inspect: true, enter: false, fill: true, validate: true, submit: false },
  };

  probe(input: { url: string }) {
    try {
      const url = new URL(input.url);
      const supported = url.hostname === 'app.mokahr.com'
        && url.pathname.startsWith('/social-recruitment/')
        && (/^#\/job\//.test(url.hash) || /^#\/jobs(?:$|[/?])/.test(url.hash));
      return { supported, score: supported ? 0.98 : 0, reason: supported ? 'moka-social-recruitment-family' : 'moka-mismatch' };
    } catch {
      return { supported: false, score: 0, reason: 'invalid-url' };
    }
  }
}

abstract class LegacyCopilotObservedAtsAdapter extends ObservedPublicAtsAdapter {
  abstract readonly descriptor: ApplySiteAdapter['descriptor'];
  abstract readonly hostSuffixes: readonly string[];

  probe(input: { url: string }) {
    try {
      const url = new URL(input.url);
      const host = url.hostname.toLowerCase();
      const supported = this.hostSuffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
      return {
        supported,
        score: supported ? 0.96 : 0,
        reason: supported ? `legacy-copilot-observed:${this.descriptor.id}` : `legacy-copilot-mismatch:${this.descriptor.id}`,
      };
    } catch {
      return { supported: false, score: 0, reason: 'invalid-url' };
    }
  }
}

export class BeisenAtsSiteAdapter extends LegacyCopilotObservedAtsAdapter {
  readonly descriptor = {
    id: 'beisen-ats', version: 'legacy-copilot-2026-09-18.1', semantics: 'formal_application' as const, priority: 165,
    capabilities: { inspect: true, enter: false, fill: true, validate: true, submit: false },
  };
  readonly hostSuffixes = ['beisen.com', 'italent.cn', 'italentx.cn', 'italentx.com'] as const;
}

export class FeishuJobsAtsSiteAdapter extends LegacyCopilotObservedAtsAdapter {
  readonly descriptor = {
    id: 'feishu-jobs-ats', version: 'legacy-copilot-2026-09-18.1', semantics: 'formal_application' as const, priority: 165,
    capabilities: { inspect: true, enter: false, fill: true, validate: true, submit: false },
  };
  readonly hostSuffixes = ['jobs.feishu.cn'] as const;
}

export class HotJobAtsSiteAdapter extends LegacyCopilotObservedAtsAdapter {
  readonly descriptor = {
    id: 'hotjob-ats', version: 'legacy-copilot-2026-09-18.1', semantics: 'formal_application' as const, priority: 160,
    capabilities: { inspect: true, enter: false, fill: true, validate: true, submit: false },
  };
  readonly hostSuffixes = ['hotjob.cn'] as const;
}

export class ZhiyeAtsSiteAdapter extends LegacyCopilotObservedAtsAdapter {
  readonly descriptor = {
    id: 'zhiye-ats', version: 'legacy-copilot-2026-09-18.1', semantics: 'formal_application' as const, priority: 160,
    capabilities: { inspect: true, enter: false, fill: true, validate: true, submit: false },
  };
  readonly hostSuffixes = ['zhiye.com'] as const;
}

export class LegacyMokaAtsSiteAdapter extends LegacyCopilotObservedAtsAdapter {
  readonly descriptor = {
    id: 'legacy-moka-ats', version: 'legacy-copilot-2026-09-18.1', semantics: 'formal_application' as const, priority: 155,
    capabilities: { inspect: true, enter: false, fill: true, validate: true, submit: false },
  };
  readonly hostSuffixes = ['mokahr.com', 'moka.com'] as const;
}

export type ObservedApplySiteFamily = 'zhilian' | 'liepin' | 'nowcoder' | 'moka' | 'beisen' | 'feishu-jobs' | 'hotjob' | 'zhiye';

export interface ObservedApplySiteRoute {
  readonly family: ObservedApplySiteFamily;
  readonly adapterId:
    | 'zhilian-ats'
    | 'liepin-ats'
    | 'nowcoder-ats'
    | 'moka-social-recruitment'
    | 'legacy-moka-ats'
    | 'beisen-ats'
    | 'feishu-jobs-ats'
    | 'hotjob-ats'
    | 'zhiye-ats';
  readonly requiresSiteResumeBinding: boolean;
}

export function observedApplySiteAdapters(): readonly ApplySiteAdapter[] {
  return [
    new ZhilianAtsSiteAdapter(),
    new LiepinAtsSiteAdapter(),
    new NowcoderAtsSiteAdapter(),
    new MokaSocialRecruitmentAtsSiteAdapter(),
    new BeisenAtsSiteAdapter(),
    new FeishuJobsAtsSiteAdapter(),
    new HotJobAtsSiteAdapter(),
    new ZhiyeAtsSiteAdapter(),
    new LegacyMokaAtsSiteAdapter(),
  ];
}

export function classifyObservedApplySite(url: string): ObservedApplySiteRoute | null {
  const registry = new ApplySiteAdapterRegistry(observedApplySiteAdapters());
  const adapter = registry.resolve({ url, semantics: 'formal_application' });
  if (!adapter) return null;
  const adapterId = adapter.descriptor.id as ObservedApplySiteRoute['adapterId'];
  const mapping: Record<ObservedApplySiteRoute['adapterId'], Omit<ObservedApplySiteRoute, 'adapterId'>> = {
    'zhilian-ats': { family: 'zhilian', requiresSiteResumeBinding: true },
    'liepin-ats': { family: 'liepin', requiresSiteResumeBinding: true },
    'nowcoder-ats': { family: 'nowcoder', requiresSiteResumeBinding: false },
    'moka-social-recruitment': { family: 'moka', requiresSiteResumeBinding: false },
    'legacy-moka-ats': { family: 'moka', requiresSiteResumeBinding: false },
    'beisen-ats': { family: 'beisen', requiresSiteResumeBinding: false },
    'feishu-jobs-ats': { family: 'feishu-jobs', requiresSiteResumeBinding: false },
    'hotjob-ats': { family: 'hotjob', requiresSiteResumeBinding: false },
    'zhiye-ats': { family: 'zhiye', requiresSiteResumeBinding: false },
  };
  const route = mapping[adapterId];
  return route ? { adapterId, ...route } : null;
}
