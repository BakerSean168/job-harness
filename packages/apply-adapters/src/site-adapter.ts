import type {
  FieldBinding,
  FillPlan,
  FillReport,
  FormIR,
} from '@job-harness/apply-contracts';
import type { BrowserDriverPort, BrowserUploadFile } from '@job-harness/apply-browser';
import type { ApplicantDataProviderPort } from './applicant-data';

export const APPLY_SITE_SEMANTICS = ['formal_application', 'outreach', 'discovery'] as const;
export type ApplySiteSemantics = (typeof APPLY_SITE_SEMANTICS)[number];

export interface ApplySiteAdapterDescriptor {
  readonly id: string;
  readonly version: string;
  readonly semantics: ApplySiteSemantics;
  readonly priority: number;
  readonly capabilities: {
    readonly inspect: boolean;
    readonly fill: boolean;
    readonly validate: boolean;
    readonly submit: boolean;
  };
}

export interface ApplySiteProbeInput {
  readonly url: string;
  readonly title?: string | null;
}

export interface ApplySiteProbeResult {
  readonly supported: boolean;
  readonly score: number;
  readonly reason: string;
}

export interface ApplyValidationIssue {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'blocking';
  readonly fieldId: string | null;
  readonly summary: string;
}

export interface ApplyValidationReport {
  readonly readyForReview: boolean;
  readonly readyForSubmit: boolean;
  readonly issues: readonly ApplyValidationIssue[];
}

export interface ApplyFillAssets {
  readonly resumeFile?: BrowserUploadFile | null;
}

export interface ApplySiteSubmitResult {
  readonly outcome: 'success' | 'external_failed' | 'uncertain';
  readonly appliedAt: string;
  readonly confirmedAt: string;
  readonly externalReference: string | null;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly error: string | null;
}

export interface ApplySiteAdapter {
  readonly descriptor: ApplySiteAdapterDescriptor;
  probe(input: ApplySiteProbeInput): ApplySiteProbeResult;
  inspect(browser: BrowserDriverPort, input: { readonly url: string; readonly title?: string | null; readonly observedAt: string }): Promise<FormIR>;
  explicitBindings?(form: FormIR): readonly FieldBinding[];
  fill?(browser: BrowserDriverPort, form: FormIR, plan: FillPlan, applicant: ApplicantDataProviderPort, assets?: ApplyFillAssets): Promise<FillReport>;
  validate(form: FormIR, plan: FillPlan, fillReport?: FillReport | null): Promise<ApplyValidationReport>;
  submit?(browser: BrowserDriverPort): Promise<ApplySiteSubmitResult>;
}

export interface ResolveApplySiteAdapterInput extends ApplySiteProbeInput {
  readonly semantics: ApplySiteSemantics;
  readonly requiredAdapterId?: string | null;
}

export class ApplySiteAdapterRegistry {
  private readonly adapters = new Map<string, ApplySiteAdapter>();

  constructor(adapters: readonly ApplySiteAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: ApplySiteAdapter): this {
    const id = adapter.descriptor.id.trim();
    if (!id) throw new Error('Apply site adapter id is required');
    if (this.adapters.has(id)) throw new Error(`Apply site adapter '${id}' is already registered`);
    this.adapters.set(id, adapter);
    return this;
  }

  get(id: string): ApplySiteAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new Error(`Apply site adapter '${id}' is not registered`);
    return adapter;
  }

  resolve(input: ResolveApplySiteAdapterInput): ApplySiteAdapter | null {
    if (input.requiredAdapterId) {
      const adapter = this.adapters.get(input.requiredAdapterId);
      if (!adapter || adapter.descriptor.semantics !== input.semantics) return null;
      return adapter.probe(input).supported ? adapter : null;
    }
    const candidates = [...this.adapters.values()]
      .filter((adapter) => adapter.descriptor.semantics === input.semantics)
      .map((adapter) => ({ adapter, probe: adapter.probe(input) }))
      .filter(({ probe }) => probe.supported)
      .sort((left, right) =>
        right.probe.score - left.probe.score
        || right.adapter.descriptor.priority - left.adapter.descriptor.priority
        || left.adapter.descriptor.id.localeCompare(right.adapter.descriptor.id));
    if (!candidates.length) return null;
    const first = candidates[0]!;
    const second = candidates[1];
    if (second && first.probe.score === second.probe.score && first.adapter.descriptor.priority === second.adapter.descriptor.priority) {
      throw new Error(`Ambiguous Apply site adapter selection between '${first.adapter.descriptor.id}' and '${second.adapter.descriptor.id}'`);
    }
    return first.adapter;
  }

  descriptors(): ApplySiteAdapterDescriptor[] {
    return [...this.adapters.values()].map((adapter) => adapter.descriptor).sort((left, right) => left.id.localeCompare(right.id));
  }
}
