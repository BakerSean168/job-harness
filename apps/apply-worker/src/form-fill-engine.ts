import { ApplicantFieldCatalogSchema, ResolvedApplicantValuesSchema, type ExecutionAttempt, type SemanticMappingProposal, type SemanticMappingView } from '@job-harness/apply-contracts';
import { buildFillPlan, buildSemanticMappingView } from '@job-harness/apply-core';
import type { BrowserDriverPort, BrowserUploadFile } from '@job-harness/apply-browser';
import type {
  ApplicantDataProviderPort,
  ApplySiteAdapterRegistry,
  ApplyValidationReport,
} from '@job-harness/apply-adapters';

export interface SemanticFieldMapperPort {
  propose(view: SemanticMappingView): Promise<readonly SemanticMappingProposal[]>;
}

export interface ResumeUploadAsset extends BrowserUploadFile {
  readonly sha256: string;
}

export interface FormFillHandoffRequiredResult {
  readonly outcome: 'handoff_required';
  readonly reasonCode: string;
  readonly summary: string;
  readonly payload: Record<string, unknown>;
}

export interface FormFillReviewResult {
  readonly outcome: 'review_ready' | 'manual_review_required';
  readonly reasonCode: string;
  readonly summary: string;
  readonly payload: Record<string, unknown>;
  readonly review: {
    readonly formStateHash: string;
    readonly formVersion: string;
    readonly catalogVersion: string;
    readonly siteAdapterId: string;
    readonly siteAdapterVersion: string;
    readonly summary: {
      readonly fieldCount: number;
      readonly bindingCount: number;
      readonly filled: number;
      readonly failed: number;
      readonly manual: number;
      readonly requiredPending: number;
      readonly prohibitedCount: number;
      readonly blockingIssueCodes: readonly string[];
      readonly readyForSubmit: boolean;
    };
  };
}

export type FormFillExecutionResult = FormFillHandoffRequiredResult | FormFillReviewResult;

export interface FormFillExecutionEngineOptions {
  readonly siteAdapters: ApplySiteAdapterRegistry;
  readonly applicant?: ApplicantDataProviderPort | null;
  readonly semanticMapper?: SemanticFieldMapperPort | null;
  readonly semanticConfidenceThreshold?: number;
}

export class FormFillExecutionEngine {
  private readonly siteAdapters: ApplySiteAdapterRegistry;
  private readonly applicant: ApplicantDataProviderPort | null;
  private readonly semanticMapper: SemanticFieldMapperPort | null;
  private readonly semanticConfidenceThreshold: number;

  constructor(options: FormFillExecutionEngineOptions) {
    this.siteAdapters = options.siteAdapters;
    this.applicant = options.applicant ?? null;
    this.semanticMapper = options.semanticMapper ?? null;
    this.semanticConfidenceThreshold = options.semanticConfidenceThreshold ?? 0.93;
  }

  resolveAdapterDescriptor(attempt: ExecutionAttempt) {
    return this.resolveAdapter(attempt).descriptor;
  }

  private resolveAdapter(attempt: ExecutionAttempt) {
    const targetUrl = attempt.bundle.listingUrl;
    if (!targetUrl) throw new Error('Frozen ApplyBundle has no Listing URL');
    const requested = attempt.requiredAdapterId && attempt.requiredAdapterId !== 'form-fill-v1'
      ? attempt.requiredAdapterId
      : null;
    const adapter = this.siteAdapters.resolve({
      url: targetUrl,
      semantics: 'formal_application',
      requiredAdapterId: requested,
    });
    if (!adapter) throw new Error(`No formal-application site adapter supports '${new URL(targetUrl).hostname}'`);
    return adapter;
  }

  async execute(input: {
    readonly attempt: ExecutionAttempt;
    readonly browser: BrowserDriverPort;
    readonly observedAt: string;
    readonly resumeFile?: ResumeUploadAsset | null;
    readonly applicant?: ApplicantDataProviderPort | null;
  }): Promise<FormFillExecutionResult> {
    const targetUrl = input.attempt.bundle.listingUrl;
    if (!targetUrl) throw new Error('Frozen ApplyBundle has no Listing URL');
    const adapter = this.resolveAdapter(input.attempt);
    if (!adapter.descriptor.capabilities.inspect || !adapter.descriptor.capabilities.fill) {
      throw new Error(`Site adapter '${adapter.descriptor.id}' cannot inspect/fill application forms`);
    }

    if (adapter.preflight) {
      let preflight = await adapter.preflight(input.browser);
      let applicationEntry: Record<string, unknown> | null = null;
      const allowApplicationEntry = input.attempt.policySnapshot.allowApplicationEntry === true;
      if (
        !preflight.canInspectForm
        && preflight.state === 'job_detail'
        && allowApplicationEntry
        && adapter.descriptor.capabilities.enter
        && adapter.enterApplication
      ) {
        const entered = await adapter.enterApplication(input.browser, preflight);
        preflight = entered.after;
        applicationEntry = {
          actionText: entered.action.text,
          actionTag: entered.action.tag,
          actionHrefHost: entered.action.href ? new URL(entered.action.href, targetUrl).hostname : null,
          beforeState: entered.beforeState,
          afterState: entered.after.state,
          navigationActionCount: entered.navigationActionCount,
        };
      }
      if (!preflight.canInspectForm) {
        return {
          outcome: 'handoff_required',
          reasonCode: preflight.reasonCode,
          summary: preflight.summary,
          payload: {
            siteAdapterId: adapter.descriptor.id,
            siteAdapterVersion: adapter.descriptor.version,
            pageState: preflight.state,
            preflight: preflight.evidence,
            ...(applicationEntry ? { applicationEntry } : {}),
          },
        };
      }
    }

    const form = await adapter.inspect(input.browser, {
      url: input.browser.currentUrl() || targetUrl,
      title: await input.browser.title().catch(() => null),
      observedAt: input.observedAt,
    });
    const applicant = input.applicant ?? this.applicant;
    if (!applicant) throw new Error('No ApplicantDataProvider is available for this execution attempt');
    const baseCatalog = await applicant.catalog();
    let catalog = baseCatalog;
    let provider = applicant;
    if (input.resumeFile) ({ catalog, provider } = createResumeArtifactApplicantView(provider, catalog, input.resumeFile.sha256));
    if (input.attempt.bundle.siteResumeBinding) ({ catalog, provider } = createSiteResumeBindingApplicantView(provider, catalog, input.attempt.bundle.siteResumeBinding));
    let proposals: readonly SemanticMappingProposal[] = [];
    if (this.semanticMapper) {
      const mappingView = buildSemanticMappingView(form, catalog);
      proposals = await this.semanticMapper.propose(mappingView);
    }
    const plan = buildFillPlan(form, catalog, {
      explicitBindings: adapter.explicitBindings?.(form, { siteResumeBinding: input.attempt.bundle.siteResumeBinding }) ?? [],
      semanticProposals: proposals,
      semanticConfidenceThreshold: this.semanticConfidenceThreshold,
    });
    const report = adapter.fill
      ? await adapter.fill(input.browser, form, plan, provider, { resumeFile: input.resumeFile ?? null })
      : { results: [], filled: 0, skipped: 0, failed: 0, manual: 0 };
    if (adapter.settleReviewState) await adapter.settleReviewState(input.browser);
    const validation = await adapter.validate(form, plan, report, { siteResumeBinding: input.attempt.bundle.siteResumeBinding });
    const formStateHash = await input.browser.formStateHash();
    return summarize(adapter.descriptor.id, adapter.descriptor.version, form.fields.length, plan, report, validation, Boolean(this.semanticMapper), formStateHash);
  }
}

function summarize(
  adapterId: string,
  adapterVersion: string,
  fieldCount: number,
  plan: ReturnType<typeof buildFillPlan>,
  report: { filled: number; skipped: number; failed: number; manual: number },
  validation: ApplyValidationReport,
  semanticMapperEnabled: boolean,
  formStateHash: string,
): FormFillExecutionResult {
  const blocking = validation.issues.filter((issue) => issue.severity === 'blocking');
  const payload = {
    siteAdapterId: adapterId,
    siteAdapterVersion: adapterVersion,
    formVersion: plan.formVersion,
    catalogVersion: plan.catalogVersion,
    fieldCount,
    bindingCount: plan.bindings.length,
    filled: report.filled,
    skipped: report.skipped,
    failed: report.failed,
    manual: report.manual,
    requiredPending: plan.pending.filter((item) => item.required).length,
    prohibitedCount: plan.prohibited.length,
    blockingIssueCodes: [...new Set(blocking.map((issue) => issue.code))].sort(),
    semanticMapperEnabled,
    // No applicant values, field values, cookies or browser storage are included.
  };
  const review = {
    formStateHash,
    formVersion: plan.formVersion,
    catalogVersion: plan.catalogVersion,
    siteAdapterId: adapterId,
    siteAdapterVersion: adapterVersion,
    summary: {
      fieldCount,
      bindingCount: plan.bindings.length,
      filled: report.filled,
      failed: report.failed,
      manual: report.manual,
      requiredPending: plan.pending.filter((item) => item.required).length,
      prohibitedCount: plan.prohibited.length,
      blockingIssueCodes: [...new Set(blocking.map((issue) => issue.code))].sort(),
      readyForSubmit: validation.readyForSubmit && blocking.length === 0,
    },
  } as const;
  if (!validation.readyForReview || blocking.length) {
    return {
      outcome: 'manual_review_required',
      reasonCode: 'form_requires_manual_review',
      summary: `${blocking.length} blocking form issue(s) require human review before any submit authorization`,
      payload,
      review,
    };
  }
  return {
    outcome: 'review_ready',
    reasonCode: 'review_ready',
    summary: validation.readyForSubmit
      ? 'Deterministic form fill is ready for human review; submit remains disabled until explicit authorization'
      : 'Deterministic form fill is ready for human review, but this adapter has no authorized submit contract',
    payload,
    review,
  };
}

function createResumeArtifactApplicantView(
  delegate: ApplicantDataProviderPort,
  baseCatalog: Awaited<ReturnType<ApplicantDataProviderPort['catalog']>>,
  artifactSha256: string,
): { catalog: Awaited<ReturnType<ApplicantDataProviderPort['catalog']>>; provider: ApplicantDataProviderPort } {
  const suffix = artifactSha256.toLowerCase().slice(0, 16);
  const version = `${baseCatalog.version}|resume:${suffix}`.slice(0, 240);
  const resumeEntry = ApplicantFieldCatalogSchema.shape.entries.element.parse({
    key: 'documents.resume',
    label: '简历',
    valueType: 'file',
    sensitivity: 'personal',
    aliases: ['resume', 'cv', '上传简历', '简历附件', 'resume upload'],
    allowAiMapping: false,
    requiresLiteral: true,
    source: 'job-harness-resume-artifact',
  });
  const entries = baseCatalog.entries.some((entry) => entry.key === resumeEntry.key)
    ? baseCatalog.entries
    : [...baseCatalog.entries, resumeEntry];
  const catalog = ApplicantFieldCatalogSchema.parse({ version, entries });
  const provider: ApplicantDataProviderPort = {
    async catalog() { return catalog; },
    async resolve(keys) {
      const delegatedKeys = keys.filter((key) => key !== 'documents.resume');
      const resolved = await delegate.resolve(delegatedKeys);
      if (resolved.catalogVersion !== baseCatalog.version) {
        throw new Error(`Applicant catalog changed during form fill: expected=${baseCatalog.version}, actual=${resolved.catalogVersion}`);
      }
      return ResolvedApplicantValuesSchema.parse({ catalogVersion: version, values: resolved.values });
    },
  };
  return { catalog, provider };
}


function createSiteResumeBindingApplicantView(
  delegate: ApplicantDataProviderPort,
  baseCatalog: Awaited<ReturnType<ApplicantDataProviderPort['catalog']>>,
  binding: NonNullable<ExecutionAttempt['bundle']['siteResumeBinding']>,
): { catalog: Awaited<ReturnType<ApplicantDataProviderPort['catalog']>>; provider: ApplicantDataProviderPort } {
  const version = `${baseCatalog.version}|site-resume:${binding.id.slice(-24)}`.slice(0, 240);
  const entry = ApplicantFieldCatalogSchema.shape.entries.element.parse({
    key: 'documents.site_resume',
    label: '站内简历',
    valueType: 'choice',
    sensitivity: 'personal',
    aliases: ['选择简历', '我的简历', '在线简历', '默认简历', 'site resume', 'resume selector'],
    allowAiMapping: false,
    requiresLiteral: true,
    source: `site-resume-binding:${binding.siteFamily}`,
  });
  const entries = baseCatalog.entries.some((item) => item.key === entry.key) ? baseCatalog.entries : [...baseCatalog.entries, entry];
  const catalog = ApplicantFieldCatalogSchema.parse({ version, entries });
  const provider: ApplicantDataProviderPort = {
    async catalog() { return catalog; },
    async resolve(keys) {
      const wantsSiteResume = keys.includes('documents.site_resume');
      const delegatedKeys = keys.filter((key) => key !== 'documents.site_resume');
      const resolved = await delegate.resolve(delegatedKeys);
      if (resolved.catalogVersion !== baseCatalog.version) {
        throw new Error(`Applicant catalog changed during site-resume fill: expected=${baseCatalog.version}, actual=${resolved.catalogVersion}`);
      }
      return ResolvedApplicantValuesSchema.parse({
        catalogVersion: version,
        values: [
          ...resolved.values,
          ...(wantsSiteResume ? [{
            key: 'documents.site_resume',
            value: binding.externalResumeLabel,
            valueType: 'choice',
            sensitivity: 'personal',
            provenance: `site-resume-binding:${binding.id}`,
            literal: true,
          }] : []),
        ],
      });
    },
  };
  return { catalog, provider };
}
