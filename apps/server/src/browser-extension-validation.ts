import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import type { ResumeArtifactRuntimePorts } from '@job-harness/resume-application';
import type { ApplicantRuntimePorts } from '@job-harness/applicant-application';
import {
  BrowserExtensionDriverCommandSchema,
  InvokeBrowserExtensionCommandInputSchema,
  type BrowserExtensionDriverCommand,
} from '@job-harness/apply-contracts';
import {
  BROWSER_EXTENSION_BRIDGE_PREFIX,
  BrowserExtensionBridge,
  BrowserExtensionBridgeError,
} from './browser-extension-bridge';
import { writeCommonRestError, writeInternalRestError, writeRestError } from './http-errors';

const ValidationRunIdSchema = z.string().trim().min(1).max(200);
const ValidationModeSchema = z.enum(['synthetic-canary', 'site-readonly', 'site-staged-readonly', 'site-resume-sync', 'boss-discovery', 'boss-chat-inspect', 'boss-outreach']);
const ReadonlySiteFamilySchema = z.enum(['zhilian', 'liepin']);
type ReadonlySiteFamily = z.infer<typeof ReadonlySiteFamilySchema>;
const BossOutreachIntentSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('greet'),
    jobUrl: z.url(),
    expectedMessage: z.string().trim().min(1).max(2_000),
    score: z.number().min(0).max(100),
    threshold: z.number().min(0).max(100),
    resumeIndex: z.number().int().min(0).max(20),
  }).strict(),
  z.object({
    operation: z.literal('resume-followup'),
    jobUrl: z.url(),
    expectedResumeIndex: z.number().int().min(0).max(20),
    score: z.number().min(0).max(100),
    threshold: z.number().min(0).max(100),
    authorizationReason: z.enum(['explicit-request', 'qualified-followup']),
  }).strict(),
]);
type BossOutreachIntent = z.infer<typeof BossOutreachIntentSchema>;
const CreateValidationRunInputSchema = z.object({
  agentId: z.string().trim().min(1).max(200),
  targetUrl: z.url(),
  mode: ValidationModeSchema.default('synthetic-canary'),
  ttlMs: z.number().int().min(30_000).max(10 * 60_000).default(3 * 60_000),
  bossOutreachIntent: BossOutreachIntentSchema.nullable().optional().default(null),
}).strict().superRefine((value, ctx) => {
  if (value.mode === 'boss-outreach' && !value.bossOutreachIntent) {
    ctx.addIssue({ code: 'custom', path: ['bossOutreachIntent'], message: 'boss-outreach requires a bounded intent' });
  }
  if (value.mode !== 'boss-outreach' && value.bossOutreachIntent) {
    ctx.addIssue({ code: 'custom', path: ['bossOutreachIntent'], message: 'bossOutreachIntent is allowed only for boss-outreach mode' });
  }
  const intent = value.bossOutreachIntent;
  if (intent?.operation === 'greet' && intent.score < intent.threshold) {
    ctx.addIssue({ code: 'custom', path: ['bossOutreachIntent', 'score'], message: 'BOSS greet requires score >= threshold' });
  }
  if (intent?.operation === 'resume-followup' && intent.authorizationReason === 'qualified-followup' && intent.score < intent.threshold) {
    ctx.addIssue({ code: 'custom', path: ['bossOutreachIntent', 'score'], message: 'qualified BOSS resume follow-up requires score >= threshold' });
  }
});
const InvokeValidationCommandInputSchema = z.object({
  sessionRef: z.string().trim().min(1).max(500).nullable().default(null),
  command: BrowserExtensionDriverCommandSchema,
  timeoutMs: z.number().int().min(1_000).max(60_000).default(30_000),
}).strict();
const SyncResumeInputSchema = z.object({
  artifactId: z.string().trim().min(1).max(200),
  fileName: z.string().trim().min(1).max(500).regex(/\.pdf$/i),
}).strict();
const RawControlSchema = z.object({
  controlRef: z.string().min(1).max(4000), kind: z.string(), label: z.string().default(''), name: z.string().nullable().optional(),
  description: z.string().nullable().optional(), required: z.boolean().default(false), disabled: z.boolean().default(false), readOnly: z.boolean().default(false),
  options: z.array(z.object({ value: z.string().optional(), label: z.string().default(''), disabled: z.boolean().default(false) }).passthrough()).default([]),
  semanticHints: z.array(z.string()).default([]), accept: z.string().nullable().optional(), multiple: z.boolean().default(false), sectionLabel: z.string().nullable().optional(),
}).passthrough();
const RawActionSchema = z.object({
  actionRef: z.string().min(1).max(4000), tag: z.string().default('other'), text: z.string().default(''), href: z.string().nullable().optional(),
  type: z.string().nullable().optional(), role: z.string().nullable().optional(), disabled: z.boolean().default(false), ariaDisabled: z.boolean().default(false),
}).passthrough();
type RawControl = z.infer<typeof RawControlSchema>;
type RawAction = z.infer<typeof RawActionSchema>;

const SAFE_VALIDATION_COMMANDS = new Set<BrowserExtensionDriverCommand['type']>([
  'session_acquire',
  'current_url',
  'title',
  'body_text',
  'exists',
  'text',
  'value_matches',
  'fill',
  'select',
  'set_checked',
  'upload',
  'wait',
  'scroll',
  'scan_controls',
  'scan_actions',
  'form_state_hash',
]);
const READONLY_SITE_COMMANDS = new Set<BrowserExtensionDriverCommand['type']>([
  'session_acquire', 'current_url', 'title', 'body_text', 'exists', 'text', 'value_matches', 'wait', 'scroll', 'scan_controls', 'scan_actions', 'form_state_hash',
]);
const RESUME_SYNC_SITE_COMMANDS = new Set<BrowserExtensionDriverCommand['type']>([
  'session_acquire', 'current_url', 'title', 'body_text', 'exists', 'text', 'value_matches',
  'fill', 'select', 'set_checked', 'upload', 'click', 'wait', 'scroll', 'scan_controls', 'scan_actions', 'form_state_hash',
]);
const RESUME_SYNC_FORBIDDEN_CLICK_TEXT = /(?:投简历|立即投递|确认投递|投递简历|立即申请|提交申请|申请职位|提交职位申请|聊一聊|发送)/i;
const BOSS_DISCOVERY_COMMANDS = new Set<BrowserExtensionDriverCommand['type']>([
  'session_acquire', 'navigate', 'current_url', 'title', 'body_text', 'exists', 'text',
  'fill', 'click', 'wait', 'scroll', 'scan_controls', 'scan_actions', 'form_state_hash', 'boss_detail_snapshot',
]);
const BOSS_SEARCH_INPUT_SELECTORS = new Set(['.search-form input', 'input[placeholder*="搜索"]', 'input[type="search"]']);
const BOSS_SEARCH_BUTTON_SELECTORS = new Set(['.search-btn']);
const BOSS_SCANNED_ACTION_SELECTOR = /^\[data-job-harness-action-id="[A-Za-z0-9._:-]+"\]$/;
const BOSS_CHAT_INSPECT_COMMANDS = new Set<BrowserExtensionDriverCommand['type']>([
  'session_acquire', 'current_url', 'title', 'body_text', 'wait',
  'boss_scan_unread_contacts', 'boss_open_contact', 'boss_chat_snapshot',
]);
const BOSS_OUTREACH_COMMANDS = new Set<BrowserExtensionDriverCommand['type']>([
  'session_acquire', 'navigate', 'current_url', 'title', 'body_text', 'wait',
  'boss_detail_snapshot', 'boss_prepare_chat', 'boss_send_message',
  'boss_scan_unread_contacts', 'boss_open_contact', 'boss_chat_snapshot',
  'boss_prepare_resume', 'boss_confirm_resume',
]);
const BOSS_OUTREACH_WRITE_COMMANDS = new Set<BrowserExtensionDriverCommand['type']>([
  'boss_prepare_chat', 'boss_send_message', 'boss_confirm_resume',
]);
const WRITE_VALIDATION_COMMANDS = new Set<BrowserExtensionDriverCommand['type']>(['fill', 'select', 'set_checked', 'upload', 'click']);

export interface BrowserExtensionCharacterizationEvidence {
  readonly observedAt: string;
  readonly currentUrl: string;
  readonly title: string;
  readonly formStateHash: string;
  readonly bodyTextLength: number;
  readonly stateSignals: readonly string[];
  readonly actions: readonly {
    readonly tag: string; readonly text: string; readonly href: string | null; readonly type: string | null; readonly role: string | null; readonly disabled: boolean; readonly ariaDisabled: boolean;
  }[];
  readonly controls: readonly {
    readonly kind: string; readonly label: string; readonly name: string | null; readonly description: string | null; readonly required: boolean; readonly disabled: boolean; readonly readOnly: boolean; readonly optionLabels: readonly string[]; readonly semanticHints: readonly string[]; readonly accept: string | null; readonly multiple: boolean; readonly sectionLabel: string | null;
  }[];
}

export interface BrowserExtensionValidationRun {
  readonly id: string;
  readonly agentId: string;
  readonly targetUrl: string;
  readonly mode: z.infer<typeof ValidationModeSchema>;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly sessionRef: string | null;
  readonly commandCount: number;
  readonly writeCount: number;
  readonly characterization: BrowserExtensionCharacterizationEvidence | null;
  readonly outreachOperation: BossOutreachIntent['operation'] | null;
}

export type SiteResumePreparationState = 'attachment_upload_ready' | 'profile_onboarding_required' | 'education_onboarding_required' | 'unknown';
export interface SiteResumePreparationResult {
  readonly run: BrowserExtensionValidationRun;
  readonly state: SiteResumePreparationState;
  readonly missingFacts: readonly string[];
  readonly manualFacts: readonly string[];
  readonly appliedFacts: readonly string[];
  readonly evidence: BrowserExtensionCharacterizationEvidence;
}

interface MutableValidationRun {
  id: string;
  agentId: string;
  targetUrl: string;
  mode: z.infer<typeof ValidationModeSchema>;
  createdAt: string;
  expiresAt: string;
  sessionRef: string | null;
  commandCount: number;
  writeCount: number;
  characterization: BrowserExtensionCharacterizationEvidence | null;
  bossOutreachIntent: BossOutreachIntent | null;
  bossChatPrepared: boolean;
  bossMessageSent: boolean;
  bossResumePrepared: boolean;
  bossResumeConfirmed: boolean;
}

export class BrowserExtensionValidationRegistry {
  private readonly runs = new Map<string, MutableValidationRun>();
  private readonly allowedOrigin: string;
  private readonly now: () => Date;
  private readonly resumeArtifacts: Pick<ResumeArtifactRuntimePorts, 'getContent'> | null;
  private readonly applicant: Pick<ApplicantRuntimePorts, 'getDefaultProfile'> | null;
  private readonly readonlySiteFamilies: ReadonlySet<ReadonlySiteFamily>;

  constructor(
    private readonly bridge: BrowserExtensionBridge,
    options: { allowedOrigin: string; readonlySiteFamilies?: readonly ReadonlySiteFamily[]; resumeArtifacts?: Pick<ResumeArtifactRuntimePorts, 'getContent'> | null; applicant?: Pick<ApplicantRuntimePorts, 'getDefaultProfile'> | null; now?: () => Date },
  ) {
    const origin = new URL(options.allowedOrigin).origin;
    if (!/^https?:\/\//i.test(origin)) throw new Error('Browser validation allowed origin must use HTTP(S)');
    this.allowedOrigin = origin;
    this.readonlySiteFamilies = new Set((options.readonlySiteFamilies ?? []).map((value) => ReadonlySiteFamilySchema.parse(value)));
    this.resumeArtifacts = options.resumeArtifacts ?? null;
    this.applicant = options.applicant ?? null;
    this.now = options.now ?? (() => new Date());
  }

  create(raw: unknown): BrowserExtensionValidationRun {
    this.reap();
    const input = CreateValidationRunInputSchema.parse(raw);
    const target = this.validateTarget(input.targetUrl, input.mode);
    const agent = this.bridge.status(input.agentId);
    if (!agent?.online) throw new BrowserExtensionBridgeError('AGENT_OFFLINE', `Browser extension agent '${input.agentId}' is offline`, 503);
    if (input.mode === 'site-staged-readonly' && !versionAtLeast(agent.version, '0.1.6')) {
      throw new BrowserExtensionBridgeError('VALIDATION_CLIENT_UPGRADE_REQUIRED', `Staged characterization requires Browser Bridge >= 0.1.6; agent '${input.agentId}' reports '${agent.version}'`, 409);
    }
    if (input.mode === 'site-resume-sync' && !versionAtLeast(agent.version, '0.2.0')) {
      throw new BrowserExtensionBridgeError('VALIDATION_CLIENT_UPGRADE_REQUIRED', `Site Resume Sync requires Browser Bridge >= 0.2.0; agent '${input.agentId}' reports '${agent.version}'`, 409);
    }
    if (input.mode === 'boss-discovery' && !versionAtLeast(agent.version, '0.2.2')) {
      throw new BrowserExtensionBridgeError('VALIDATION_CLIENT_UPGRADE_REQUIRED', `BOSS discovery requires Browser Bridge >= 0.2.2; agent '${input.agentId}' reports '${agent.version}'`, 409);
    }
    if ((input.mode === 'boss-chat-inspect' || input.mode === 'boss-outreach') && !versionAtLeast(agent.version, '0.2.3')) {
      throw new BrowserExtensionBridgeError('VALIDATION_CLIENT_UPGRADE_REQUIRED', `BOSS chat/outreach requires Browser Bridge >= 0.2.3; agent '${input.agentId}' reports '${agent.version}'`, 409);
    }
    if (input.mode === 'boss-outreach') this.validateBossOutreachIntentTarget(target, input.bossOutreachIntent!);
    const createdAt = this.now().toISOString();
    const run: MutableValidationRun = {
      id: randomUUID(),
      agentId: input.agentId,
      targetUrl: target,
      mode: input.mode,
      createdAt,
      expiresAt: new Date(this.now().getTime() + input.ttlMs).toISOString(),
      sessionRef: null,
      commandCount: 0,
      writeCount: 0,
      characterization: null,
      bossOutreachIntent: input.bossOutreachIntent ?? null,
      bossChatPrepared: false,
      bossMessageSent: false,
      bossResumePrepared: false,
      bossResumeConfirmed: false,
    };
    this.runs.set(run.id, run);
    return freezeRun(run);
  }

  get(id: string): BrowserExtensionValidationRun | null {
    this.reap();
    const run = this.runs.get(ValidationRunIdSchema.parse(id));
    return run ? freezeRun(run) : null;
  }

  list(): BrowserExtensionValidationRun[] {
    this.reap();
    return [...this.runs.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
      .map(freezeRun);
  }

  async invoke(id: string, raw: unknown): Promise<{ run: BrowserExtensionValidationRun; commandId: string; result: unknown }> {
    this.reap();
    const run = this.requireRun(id);
    const input = InvokeValidationCommandInputSchema.parse(raw);
    const allowedCommands = run.mode === 'site-resume-sync'
      ? RESUME_SYNC_SITE_COMMANDS
      : run.mode === 'boss-discovery'
        ? BOSS_DISCOVERY_COMMANDS
        : run.mode === 'boss-chat-inspect'
          ? BOSS_CHAT_INSPECT_COMMANDS
          : run.mode === 'boss-outreach'
            ? BOSS_OUTREACH_COMMANDS
            : run.mode === 'site-readonly' || run.mode === 'site-staged-readonly'
            ? READONLY_SITE_COMMANDS
            : SAFE_VALIDATION_COMMANDS;
    if (!allowedCommands.has(input.command.type)) {
      throw new BrowserExtensionBridgeError('VALIDATION_COMMAND_DENIED', `Browser validation mode '${run.mode}' does not allow '${input.command.type}'`, 403);
    }
    if (input.command.type === 'upload') {
      const file = input.command.payload.file;
      if (file.mimeType !== 'application/pdf' || !/\.pdf$/i.test(file.name) || file.bytesBase64.length < 4) {
        throw new BrowserExtensionBridgeError('VALIDATION_UPLOAD_DENIED', 'Browser upload requires one non-empty PDF', 403);
      }
      if (run.mode !== 'site-resume-sync' && input.command.payload.selector !== '#resume') {
        throw new BrowserExtensionBridgeError('VALIDATION_UPLOAD_DENIED', 'Synthetic browser validation upload is restricted to #resume', 403);
      }
    }
    if (run.mode === 'boss-discovery') this.authorizeBossDiscoveryCommand(run, input.command);
    if (run.mode === 'boss-outreach') this.authorizeBossOutreachCommand(run, input.command);
    if (run.mode === 'site-resume-sync' && input.command.type === 'click') {
      const expected = input.command.payload.expectedText?.trim() ?? '';
      const scannedFieldSelector = /^\[data-job-harness-(?:field-id|radio-group)=\"[A-Za-z0-9._:-]+\"\]$/.test(input.command.payload.selector);
      if ((!expected && !scannedFieldSelector) || (expected && RESUME_SYNC_FORBIDDEN_CLICK_TEXT.test(expected))) {
        throw new BrowserExtensionBridgeError('VALIDATION_CLICK_DENIED', 'Site Resume Sync can click scanned form controls or explicit non-application actions only', 403);
      }
    }

    if (input.command.type === 'session_acquire') {
      if (run.sessionRef) throw new BrowserExtensionBridgeError('VALIDATION_SESSION_EXISTS', 'Browser validation run already owns a session', 409);
      const preferred = input.command.payload.preferredUrl;
      const sync = run.mode === 'site-resume-sync';
      const bossDiscovery = run.mode === 'boss-discovery';
      const bossChatInspect = run.mode === 'boss-chat-inspect';
      const bossOutreach = run.mode === 'boss-outreach';
      if (bossDiscovery) {
        if (!preferred || this.validateTarget(preferred, run.mode) !== run.targetUrl || input.command.payload.requireLiveSession !== false) {
          throw new BrowserExtensionBridgeError('VALIDATION_TARGET_MISMATCH', 'BOSS discovery must acquire the frozen BOSS search page in the user-owned Chrome profile', 409);
        }
      } else if (bossChatInspect) {
        if (!preferred || this.validateTarget(preferred, run.mode) !== run.targetUrl || input.command.payload.requireLiveSession !== false) {
          throw new BrowserExtensionBridgeError('VALIDATION_TARGET_MISMATCH', 'BOSS chat inspection must acquire the frozen Geek chat surface in the user-owned Chrome profile', 409);
        }
      } else if (bossOutreach) {
        if (!preferred || this.validateTarget(preferred, run.mode) !== run.targetUrl || input.command.payload.requireLiveSession !== false) {
          throw new BrowserExtensionBridgeError('VALIDATION_TARGET_MISMATCH', 'BOSS outreach must acquire its frozen BOSS job/chat target in the user-owned Chrome profile', 409);
        }
      } else if (sync) {
        const reuse = input.command.payload.reuseLiveSession;
        const openExactResumePage = reuse === false && isSafeResumeManagementTarget(run.targetUrl);
        if (!preferred || this.validateTarget(preferred, run.mode) !== run.targetUrl || input.command.payload.requireLiveSession !== false || (reuse !== true && !openExactResumePage)) {
          throw new BrowserExtensionBridgeError(
            'VALIDATION_LIVE_SESSION_REQUIRED',
            'Site Resume Sync must reuse an existing recruiting-site tab or open one allowlisted resume-management page without navigating an unrelated page',
            403,
          );
        }
      } else if (!preferred || this.validateTarget(preferred, run.mode) !== run.targetUrl) {
        throw new BrowserExtensionBridgeError('VALIDATION_TARGET_MISMATCH', 'Browser validation session must acquire the frozen canary URL', 409);
      }
      const staged = run.mode === 'site-staged-readonly';
      if (!sync && !staged && !bossDiscovery && !bossChatInspect && !bossOutreach && input.command.payload.reuseLiveSession) {
        throw new BrowserExtensionBridgeError('VALIDATION_REUSE_DENIED', 'This browser validation mode must create an isolated Chrome tab', 403);
      }
      if (staged && (!input.command.payload.reuseLiveSession || input.command.payload.requireLiveSession !== true)) {
        throw new BrowserExtensionBridgeError('VALIDATION_LIVE_SESSION_REQUIRED', 'Staged read-only characterization must reuse an already-open Chrome tab and may not create or navigate one', 403);
      }
      const output = await this.bridge.invoke(InvokeBrowserExtensionCommandInputSchema.parse({
        agentId: run.agentId,
        sessionRef: null,
        command: input.command,
        timeoutMs: input.timeoutMs,
      }));
      const result = requireRecord(output.result, 'session_acquire');
      const sessionRef = requireString(result.sessionRef, 'sessionRef');
      const currentUrl = requireString(result.currentUrl, 'currentUrl');
      const acquiredTargetOk = bossDiscovery
        ? isBossDiscoveryCurrentUrl(currentUrl)
        : bossChatInspect
          ? isBossChatInspectCurrentUrl(currentUrl)
          : bossOutreach
            ? isBossOutreachCurrentUrl(currentUrl, run.bossOutreachIntent!, run.targetUrl)
            : sync
            ? this.sameSite(currentUrl, run.targetUrl)
            : this.sameTarget(currentUrl, run.targetUrl, run.mode);
      if (!acquiredTargetOk) {
        throw new BrowserExtensionBridgeError('VALIDATION_TARGET_MISMATCH', staged ? 'Staged characterization requires an already-open tab on this exact job. Open the target job, manually enter its resume-selection/final-confirmation layer, and retry.' : sync ? 'Site Resume Sync must acquire an active tab on the configured recruiting site' : bossDiscovery ? 'BOSS discovery did not acquire a safe BOSS search/login tab' : bossChatInspect ? 'BOSS chat inspection did not acquire a safe chat/login surface' : bossOutreach ? 'BOSS outreach did not acquire its allowlisted job/chat/login surface' : 'Browser validation Chrome tab opened an unexpected job URL', 409);
      }
      run.sessionRef = sessionRef;
      run.commandCount += 1;
      return { run: freezeRun(run), commandId: output.commandId, result: output.result };
    }

    if (!run.sessionRef || input.sessionRef !== run.sessionRef) {
      throw new BrowserExtensionBridgeError('VALIDATION_SESSION_MISMATCH', 'Browser validation command is not bound to the acquired Chrome tab', 409);
    }

    // The user owns this browser and can manually navigate the tab at any time.
    // Re-check the URL immediately before every command so a validation write can
    // never escape the frozen synthetic ATS page.
    const current = await this.bridge.invoke({
      agentId: run.agentId,
      sessionRef: run.sessionRef,
      command: { type: 'current_url', payload: {} },
      timeoutMs: Math.min(input.timeoutMs, 10_000),
    });
    const currentUrl = requireString(current.result, 'current_url');
    const targetStillSafe = run.mode === 'boss-discovery'
      ? isBossDiscoveryCurrentUrl(currentUrl)
      : run.mode === 'boss-chat-inspect'
        ? isBossChatInspectCurrentUrl(currentUrl)
        : run.mode === 'boss-outreach'
        ? isBossOutreachCurrentUrl(currentUrl, run.bossOutreachIntent!, run.targetUrl)
        : run.mode === 'site-resume-sync'
          ? this.sameSite(currentUrl, run.targetUrl)
          : this.sameTarget(currentUrl, run.targetUrl, run.mode);
    if (!targetStillSafe) {
      throw new BrowserExtensionBridgeError('VALIDATION_TARGET_DRIFT', run.mode === 'site-resume-sync' ? 'Site Resume Sync tab left the configured recruiting site' : run.mode === 'boss-discovery' ? 'BOSS discovery tab left the allowlisted BOSS search/detail/login surface' : run.mode === 'boss-chat-inspect' ? 'BOSS chat inspection tab left the allowlisted chat/login surface' : run.mode === 'boss-outreach' ? 'BOSS outreach tab left the allowlisted job/chat/login surface' : 'Browser validation tab navigated away from the frozen canary URL', 409);
    }
    if (run.mode === 'boss-discovery' && (input.command.type === 'fill' || input.command.type === 'click') && !isBossSearchTarget(new URL(currentUrl))) {
      throw new BrowserExtensionBridgeError('VALIDATION_COMMAND_DENIED', `BOSS discovery '${input.command.type}' is allowed only on the BOSS search page`, 403);
    }

    const output = await this.bridge.invoke(InvokeBrowserExtensionCommandInputSchema.parse({
      agentId: run.agentId,
      sessionRef: run.sessionRef,
      command: input.command,
      timeoutMs: input.timeoutMs,
    }));
    run.commandCount += 1;
    if (WRITE_VALIDATION_COMMANDS.has(input.command.type) || BOSS_OUTREACH_WRITE_COMMANDS.has(input.command.type)) run.writeCount += 1;
    if (run.mode === 'boss-outreach') {
      if (input.command.type === 'boss_prepare_chat') run.bossChatPrepared = true;
      if (input.command.type === 'boss_send_message') run.bossMessageSent = true;
      if (input.command.type === 'boss_prepare_resume') run.bossResumePrepared = true;
      if (input.command.type === 'boss_confirm_resume') run.bossResumeConfirmed = true;
    }
    return { run: freezeRun(run), commandId: output.commandId, result: output.result };
  }

  async prepareResume(id: string): Promise<SiteResumePreparationResult> {
    this.reap();
    const run = this.requireRun(id);
    if (run.mode !== 'site-resume-sync') throw new BrowserExtensionBridgeError('VALIDATION_MODE_REQUIRED', 'Resume preparation requires a site-resume-sync run', 409);
    if (!run.sessionRef) {
      try {
        await this.invoke(id, { sessionRef: null, command: { type: 'session_acquire', payload: { preferredUrl: run.targetUrl, reuseLiveSession: true, requireLiveSession: false } }, timeoutMs: 30_000 });
      } catch (error) {
        if (!(error instanceof BrowserExtensionBridgeError) || error.code !== 'VALIDATION_TARGET_MISMATCH' || !isSafeResumeManagementTarget(run.targetUrl)) throw error;
        await this.invoke(id, { sessionRef: null, command: { type: 'session_acquire', payload: { preferredUrl: run.targetUrl, reuseLiveSession: false, requireLiveSession: false } }, timeoutMs: 30_000 });
      }
    }
    const sessionRef = run.sessionRef!;
    const capture = async () => {
      const current = await this.invoke(id, { sessionRef, command: { type: 'current_url', payload: {} }, timeoutMs: 10_000 });
      const title = await this.invoke(id, { sessionRef, command: { type: 'title', payload: {} }, timeoutMs: 10_000 });
      const body = await this.invoke(id, { sessionRef, command: { type: 'body_text', payload: { limit: 50_000 } }, timeoutMs: 15_000 });
      const actions = await this.invoke(id, { sessionRef, command: { type: 'scan_actions', payload: {} }, timeoutMs: 15_000 });
      const controls = await this.invoke(id, { sessionRef, command: { type: 'scan_controls', payload: {} }, timeoutMs: 15_000 });
      const formHash = await this.invoke(id, { sessionRef, command: { type: 'form_state_hash', payload: {} }, timeoutMs: 15_000 });
      const bodyText = requireString(body.result, 'body_text');
      const rawActions = parseRawActions(actions.result);
      const rawControls = parseRawControls(controls.result);
      const sanitizedActions = sanitizeCharacterizationActions(actions.result);
      const sanitizedControls = sanitizeCharacterizationControls(controls.result);
      const evidence: BrowserExtensionCharacterizationEvidence = {
        observedAt: this.now().toISOString(),
        currentUrl: requireString(current.result, 'current_url'),
        title: requireString(title.result, 'title').slice(0, 500),
        formStateHash: requireString(formHash.result, 'form_state_hash').slice(0, 200),
        bodyTextLength: bodyText.length,
        stateSignals: characterizedStateSignals(bodyText, sanitizedControls),
        actions: sanitizedActions,
        controls: sanitizedControls,
      };
      return { bodyText, rawActions, rawControls, evidence };
    };

    let observed = await capture();
    if (findResumeUploadControl(observed.rawControls)) {
      run.characterization = observed.evidence;
      return { run: freezeRun(run), state: 'attachment_upload_ready', missingFacts: [], manualFacts: [], appliedFacts: [], evidence: observed.evidence };
    }
    const profileOnboarding = isLiepinProfileOnboarding(observed.evidence.currentUrl, observed.bodyText);
    const educationOnboarding = isLiepinEducationOnboarding(observed.evidence.currentUrl, observed.bodyText);
    if (!profileOnboarding && !educationOnboarding) {
      run.characterization = observed.evidence;
      return { run: freezeRun(run), state: 'unknown', missingFacts: [], manualFacts: [], appliedFacts: [], evidence: observed.evidence };
    }

    const applicantContext = await this.applicant?.getDefaultProfile() ?? null;
    if (!applicantContext) {
      run.characterization = observed.evidence;
      return { run: freezeRun(run), state: educationOnboarding ? 'education_onboarding_required' : 'profile_onboarding_required', missingFacts: ['applicantProfile'], manualFacts: [], appliedFacts: [], evidence: observed.evidence };
    }
    const profile = applicantContext.profile;

    if (educationOnboarding) {
      const education = profile.education[0] ?? null;
      const missingFacts = [
        !education ? 'education[0]' : null,
        education && !education.school ? 'education[0].school' : null,
        education && !education.major ? 'education[0].major' : null,
        education && !education.degree ? 'education[0].degree' : null,
        education && !education.admissionType ? 'education[0].admissionType' : null,
        education && !education.startMonth ? 'education[0].startMonth' : null,
        education && !education.endMonth ? 'education[0].endMonth' : null,
      ].filter((value): value is string => Boolean(value));
      const manualFacts: string[] = [];
      const appliedFacts: string[] = [];
      const scanActions = async () => parseRawActions((await this.invoke(id, { sessionRef, command: { type: 'scan_actions', payload: {} }, timeoutMs: 15_000 })).result);
      const wait = async (milliseconds = 300) => { await this.invoke(id, { sessionRef, command: { type: 'wait', payload: { milliseconds } }, timeoutMs: 15_000 }); };
      const clickExactAction = async (text: string): Promise<boolean> => {
        const action = uniqueActionByText(await scanActions(), text);
        if (!action) return false;
        await this.invoke(id, { sessionRef, command: { type: 'click', payload: { selector: action.actionRef, expectedText: text } }, timeoutMs: 15_000 });
        return true;
      };
      const chooseAutocomplete = async (control: RawControl | null, value: string, factKey: string) => {
        if (!control) { manualFacts.push(factKey); return; }
        await this.invoke(id, { sessionRef, command: { type: 'fill', payload: { selector: control.controlRef, value, blur: true } }, timeoutMs: 15_000 });
        await wait(200);
        const matched = await this.invoke(id, { sessionRef, command: { type: 'value_matches', payload: { selector: control.controlRef, expected: value } }, timeoutMs: 15_000 });
        if (matched.result === true) appliedFacts.push(factKey); else manualFacts.push(factKey);
      };
      const choosePickerValue = async (control: RawControl | null, value: string, factKey: string) => {
        if (!control) { manualFacts.push(factKey); return; }
        await this.invoke(id, { sessionRef, command: { type: 'click', payload: { selector: control.controlRef, expectedText: null } }, timeoutMs: 15_000 });
        await wait(250);
        if (await clickExactAction(value)) appliedFacts.push(factKey); else manualFacts.push(factKey);
      };
      const chooseMonth = async (control: RawControl | null, value: string, factKey: string) => {
        if (!control) { manualFacts.push(factKey); return; }
        await this.invoke(id, { sessionRef, command: { type: 'fill', payload: { selector: control.controlRef, value, blur: true } }, timeoutMs: 15_000 });
        await wait(200);
        const matched = await this.invoke(id, { sessionRef, command: { type: 'value_matches', payload: { selector: control.controlRef, expected: value } }, timeoutMs: 15_000 });
        if (matched.result === true) appliedFacts.push(factKey); else manualFacts.push(factKey);
      };

      if (education) {
        const admissionText = education.admissionType === 'unified' ? '统招' : education.admissionType === 'non_unified' ? '非统招' : null;
        if (admissionText) {
          if (await clickExactAction(admissionText)) appliedFacts.push('education[0].admissionType');
          else manualFacts.push('education[0].admissionType');
        }
        const schoolControl = uniqueControlByMeaning(observed.rawControls, '学校名称');
        await chooseAutocomplete(schoolControl, education.school, 'education[0].school');
        if (education.degree) {
          if (normalizedContains(observed.bodyText, education.degree)) appliedFacts.push('education[0].degree');
          else await choosePickerValue(uniqueControlByMeaning(observed.rawControls, '学历', true), education.degree, 'education[0].degree');
        }
        const majorControl = uniqueControlByMeaning(observed.rawControls, '专业')
          ?? uniqueLiepinEducationMajorControl(observed.rawControls, schoolControl);
        await chooseAutocomplete(majorControl, education.major, 'education[0].major');
        if (education.startMonth) await chooseMonth(uniqueControlByLabel(observed.rawControls, '入学时间', true), education.startMonth, 'education[0].startMonth');
        if (education.endMonth) await chooseMonth(uniqueControlByLabel(observed.rawControls, '毕业时间', true), education.endMonth, 'education[0].endMonth');
      }
      if (appliedFacts.length) observed = await capture();
      run.characterization = observed.evidence;
      return {
        run: freezeRun(run), state: 'education_onboarding_required',
        missingFacts: [...new Set(missingFacts)], manualFacts: [...new Set(manualFacts)], appliedFacts: [...new Set(appliedFacts)], evidence: observed.evidence,
      };
    }

    const missingFacts = [
      !profile.gender ? 'gender' : null,
      !profile.birthDate ? 'birthDate' : null,
      !profile.location ? 'location' : null,
      !profile.jobSearchStatus ? 'jobSearchStatus' : null,
      !profile.careerIdentity ? 'careerIdentity' : null,
    ].filter((value): value is string => Boolean(value));
    const manualFacts: string[] = [];
    const appliedFacts: string[] = [];

    const nameControl = uniqueSectionControl(observed.rawControls, '姓名');
    if (nameControl && profile.displayName) {
      await this.invoke(id, { sessionRef, command: { type: 'fill', payload: { selector: nameControl.controlRef, value: profile.displayName } }, timeoutMs: 15_000 });
      appliedFacts.push('displayName');
    }
    const emailControl = uniqueSectionControl(observed.rawControls, '邮箱');
    if (emailControl && profile.email) {
      await this.invoke(id, { sessionRef, command: { type: 'fill', payload: { selector: emailControl.controlRef, value: profile.email } }, timeoutMs: 15_000 });
      appliedFacts.push('email');
    }
    if (profile.careerIdentity) {
      const identityText = profile.careerIdentity === 'professional' ? '我是职场人' : '我是学生';
      const identityAction = uniqueActionByText(observed.rawActions, identityText);
      if (identityAction) {
        await this.invoke(id, { sessionRef, command: { type: 'click', payload: { selector: identityAction.actionRef, expectedText: identityText } }, timeoutMs: 15_000 });
        appliedFacts.push('careerIdentity');
        if (profile.careerIdentity === 'new_graduate') {
          if (profile.jobSearchStatus === 'actively_looking') {
            observed = await capture();
            const statusControl = uniqueSectionControl(observed.rawControls, '当前求职状态', true);
            if (statusControl) {
              await this.invoke(id, { sessionRef, command: { type: 'click', payload: { selector: statusControl.controlRef, expectedText: null } }, timeoutMs: 15_000 });
              const statusActionsRaw = await this.invoke(id, { sessionRef, command: { type: 'scan_actions', payload: {} }, timeoutMs: 15_000 });
              const statusAction = uniqueActionByText(parseRawActions(statusActionsRaw.result), '离校，在找工作');
              if (statusAction) {
                await this.invoke(id, { sessionRef, command: { type: 'click', payload: { selector: statusAction.actionRef, expectedText: '离校，在找工作' } }, timeoutMs: 15_000 });
                appliedFacts.push('jobSearchStatus');
              } else manualFacts.push('jobSearchStatus');
            } else manualFacts.push('jobSearchStatus');
          } else manualFacts.push('jobSearchStatus');
        }
      } else manualFacts.push('careerIdentity');
    }
    if (profile.gender) {
      const genderText = profile.gender === 'male' ? '男' : '女';
      const genderAction = uniqueActionByText(observed.rawActions, genderText);
      if (genderAction) {
        await this.invoke(id, { sessionRef, command: { type: 'click', payload: { selector: genderAction.actionRef, expectedText: genderText } }, timeoutMs: 15_000 });
        appliedFacts.push('gender');
      } else manualFacts.push('gender');
    }
    if (profile.birthDate) manualFacts.push('birthDate');
    if (profile.location && !normalizedContains(observed.bodyText, profile.location)) manualFacts.push('location');
    if (profile.careerIdentity === 'professional' && profile.jobSearchStatus) manualFacts.push('jobSearchStatus');

    if (appliedFacts.length) observed = await capture();
    run.characterization = observed.evidence;
    return {
      run: freezeRun(run), state: 'profile_onboarding_required',
      missingFacts: [...new Set(missingFacts)], manualFacts: [...new Set(manualFacts)], appliedFacts: [...new Set(appliedFacts)], evidence: observed.evidence,
    };
  }

  async syncResume(id: string, raw: unknown): Promise<{
    run: BrowserExtensionValidationRun; artifactId: string; artifactSha256: string; uploadedControl: { label: string; name: string | null; accept: string | null }; evidence: BrowserExtensionCharacterizationEvidence;
  }> {
    this.reap();
    const run = this.requireRun(id);
    if (run.mode !== 'site-resume-sync') throw new BrowserExtensionBridgeError('VALIDATION_MODE_REQUIRED', 'Resume sync requires a site-resume-sync run', 409);
    if (!this.resumeArtifacts) throw new BrowserExtensionBridgeError('VALIDATION_DISABLED', 'Resume artifact access is not configured for browser validation', 503);
    const input = SyncResumeInputSchema.parse(raw);
    const content = await this.resumeArtifacts.getContent(input.artifactId);
    if (!content || content.artifact.kind !== 'pdf' || content.artifact.mimeType !== 'application/pdf') {
      throw new BrowserExtensionBridgeError('VALIDATION_UPLOAD_DENIED', `ResumeArtifact '${input.artifactId}' is missing or is not a PDF`, 409);
    }
    if (content.bytes.byteLength > 12_000_000) throw new BrowserExtensionBridgeError('VALIDATION_UPLOAD_DENIED', 'Resume PDF exceeds the bounded site-sync upload size', 413);
    if (!run.sessionRef) {
      await this.invoke(id, { sessionRef: null, command: { type: 'session_acquire', payload: { preferredUrl: run.targetUrl, reuseLiveSession: true, requireLiveSession: false } }, timeoutMs: 30_000 });
    }
    const sessionRef = run.sessionRef!;
    const controlsResult = await this.invoke(id, { sessionRef, command: { type: 'scan_controls', payload: {} }, timeoutMs: 15_000 });
    const uploadControl = selectResumeUploadControl(controlsResult.result);
    await this.invoke(id, {
      sessionRef,
      command: { type: 'upload', payload: { selector: uploadControl.controlRef, file: { name: input.fileName, mimeType: 'application/pdf', bytesBase64: Buffer.from(content.bytes).toString('base64') } } },
      timeoutMs: 60_000,
    });
    await this.invoke(id, { sessionRef, command: { type: 'wait', payload: { milliseconds: 3500 } }, timeoutMs: 10_000 });
    const current = await this.invoke(id, { sessionRef, command: { type: 'current_url', payload: {} }, timeoutMs: 10_000 });
    const title = await this.invoke(id, { sessionRef, command: { type: 'title', payload: {} }, timeoutMs: 10_000 });
    const body = await this.invoke(id, { sessionRef, command: { type: 'body_text', payload: { limit: 50_000 } }, timeoutMs: 15_000 });
    const actions = await this.invoke(id, { sessionRef, command: { type: 'scan_actions', payload: {} }, timeoutMs: 15_000 });
    const controls = await this.invoke(id, { sessionRef, command: { type: 'scan_controls', payload: {} }, timeoutMs: 15_000 });
    const formHash = await this.invoke(id, { sessionRef, command: { type: 'form_state_hash', payload: {} }, timeoutMs: 15_000 });
    const bodyText = requireString(body.result, 'body_text');
    const sanitizedActions = sanitizeCharacterizationActions(actions.result);
    const sanitizedControls = sanitizeCharacterizationControls(controls.result);
    const evidence: BrowserExtensionCharacterizationEvidence = {
      observedAt: this.now().toISOString(), currentUrl: requireString(current.result, 'current_url'), title: requireString(title.result, 'title').slice(0, 500), formStateHash: requireString(formHash.result, 'form_state_hash').slice(0, 200), bodyTextLength: bodyText.length, stateSignals: characterizedStateSignals(bodyText, sanitizedControls), actions: sanitizedActions, controls: sanitizedControls,
    };
    run.characterization = evidence;
    return { run: freezeRun(run), artifactId: content.artifact.id, artifactSha256: content.artifact.sha256, uploadedControl: { label: uploadControl.label, name: uploadControl.name, accept: uploadControl.accept }, evidence };
  }

  async characterize(id: string): Promise<{ run: BrowserExtensionValidationRun; evidence: BrowserExtensionCharacterizationEvidence }> {
    this.reap();
    const run = this.requireRun(id);
    if (run.mode !== 'site-readonly' && run.mode !== 'site-staged-readonly') {
      throw new BrowserExtensionBridgeError('VALIDATION_MODE_REQUIRED', 'Characterization requires a read-only site validation run', 409);
    }
    if (!run.sessionRef) {
      const staged = run.mode === 'site-staged-readonly';
      await this.invoke(id, {
        sessionRef: null,
        command: { type: 'session_acquire', payload: { preferredUrl: run.targetUrl, reuseLiveSession: staged, requireLiveSession: staged } },
        timeoutMs: 30_000,
      });
    }
    const sessionRef = run.sessionRef!;
    await this.invoke(id, { sessionRef, command: { type: 'wait', payload: { milliseconds: 1200 } }, timeoutMs: 10_000 });
    const current = await this.invoke(id, { sessionRef, command: { type: 'current_url', payload: {} }, timeoutMs: 10_000 });
    const title = await this.invoke(id, { sessionRef, command: { type: 'title', payload: {} }, timeoutMs: 10_000 });
    const body = await this.invoke(id, { sessionRef, command: { type: 'body_text', payload: { limit: 50_000 } }, timeoutMs: 15_000 });
    const actions = await this.invoke(id, { sessionRef, command: { type: 'scan_actions', payload: {} }, timeoutMs: 15_000 });
    const controls = await this.invoke(id, { sessionRef, command: { type: 'scan_controls', payload: {} }, timeoutMs: 15_000 });
    const formHash = await this.invoke(id, { sessionRef, command: { type: 'form_state_hash', payload: {} }, timeoutMs: 15_000 });
    const bodyText = requireString(body.result, 'body_text');
    const sanitizedActions = sanitizeCharacterizationActions(actions.result);
    const sanitizedControls = sanitizeCharacterizationControls(controls.result);
    const evidence: BrowserExtensionCharacterizationEvidence = {
      observedAt: this.now().toISOString(),
      currentUrl: requireString(current.result, 'current_url'),
      title: requireString(title.result, 'title').slice(0, 500),
      formStateHash: requireString(formHash.result, 'form_state_hash').slice(0, 200),
      bodyTextLength: bodyText.length,
      stateSignals: characterizedStateSignals(bodyText, sanitizedControls),
      actions: sanitizedActions,
      controls: sanitizedControls,
    };
    run.characterization = evidence;
    return { run: freezeRun(run), evidence };
  }

  private validateTarget(raw: string, mode: z.infer<typeof ValidationModeSchema>): string {
    const url = new URL(raw);
    if (mode === 'boss-discovery') {
      if (!isBossSearchTarget(url)) throw new BrowserExtensionBridgeError('VALIDATION_TARGET_DENIED', 'BOSS discovery target must be the HTTPS BOSS Geek search page', 403);
      url.search = '';
      url.hash = '';
      return url.toString();
    }
    if (mode === 'boss-chat-inspect') {
      if (!isBossChatUrl(url.toString())) throw new BrowserExtensionBridgeError('VALIDATION_TARGET_DENIED', 'BOSS chat inspection target must be the HTTPS Geek chat page', 403);
      url.search = '';
      url.hash = '';
      return url.toString();
    }
    if (mode === 'boss-outreach') {
      if (!isBossOutreachTarget(url)) throw new BrowserExtensionBridgeError('VALIDATION_TARGET_DENIED', 'BOSS outreach target must be an HTTPS BOSS job-detail or Geek chat page', 403);
      if (/^\/job_detail\//i.test(url.pathname)) url.search = '';
      url.hash = '';
      return url.toString();
    }
    if (mode === 'site-resume-sync') {
      if (url.protocol !== 'https:' || url.username || url.password) throw new BrowserExtensionBridgeError('VALIDATION_TARGET_DENIED', 'Site Resume Sync requires an HTTPS recruiting-site URL without credentials', 403);
      const host = url.hostname.toLowerCase();
      const allowed = (this.readonlySiteFamilies.has('zhilian') && (host === 'zhaopin.com' || host === 'www.zhaopin.com'))
        || (this.readonlySiteFamilies.has('liepin') && (host === 'liepin.com' || host === 'www.liepin.com' || host === 'c.liepin.com'));
      if (!allowed) throw new BrowserExtensionBridgeError('VALIDATION_TARGET_DENIED', 'Site Resume Sync target is outside configured recruiting sites', 403);
      url.search = '';
      url.hash = '';
      return url.toString();
    }
    if (mode === 'synthetic-canary') {
      if (url.origin !== this.allowedOrigin || url.pathname !== '/labs/apply-canary') {
        throw new BrowserExtensionBridgeError('VALIDATION_TARGET_DENIED', 'Browser validation synthetic target must be the configured ATS canary route', 403);
      }
      const runId = url.searchParams.get('run')?.trim() ?? '';
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(runId) || url.searchParams.has('format')) {
        throw new BrowserExtensionBridgeError('VALIDATION_TARGET_DENIED', 'Browser validation target requires one safe canary run id', 403);
      }
      if ([...url.searchParams.keys()].some((key) => key !== 'run')) {
        throw new BrowserExtensionBridgeError('VALIDATION_TARGET_DENIED', 'Browser validation target contains unsupported query parameters', 403);
      }
      url.hash = '';
      return url.toString();
    }

    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new BrowserExtensionBridgeError('VALIDATION_TARGET_DENIED', 'Read-only site validation requires an HTTPS recruiting-site URL without credentials', 403);
    }
    const host = url.hostname.toLowerCase();
    const zhilian = this.readonlySiteFamilies.has('zhilian')
      && (host === 'zhaopin.com' || host === 'www.zhaopin.com')
      && /^\/jobdetail\/[^/]+\.htm$/i.test(url.pathname);
    const liepin = this.readonlySiteFamilies.has('liepin')
      && (host === 'liepin.com' || host === 'www.liepin.com')
      && /^\/job\/\d+\.shtml$/i.test(url.pathname);
    if (!zhilian && !liepin) {
      throw new BrowserExtensionBridgeError('VALIDATION_TARGET_DENIED', 'Read-only site validation target is outside the configured characterized recruiting-site families', 403);
    }
    // Recruiting sites routinely append tracking/query parameters to the same job.
    // Read-only characterization binds to the stable job identity (host + path),
    // while synthetic canary mode above keeps its strict query contract.
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  private sameTarget(left: string, right: string, mode: z.infer<typeof ValidationModeSchema>): boolean {
    try { return this.validateTarget(left, mode) === this.validateTarget(right, mode); }
    catch { return false; }
  }

  private validateBossOutreachIntentTarget(target: string, intent: BossOutreachIntent): void {
    const url = new URL(target);
    if (intent.operation === 'greet') {
      const expected = canonicalBossDetailUrl(intent.jobUrl);
      const actual = canonicalBossDetailUrl(target);
      if (!expected || !actual || expected !== actual) {
        throw new BrowserExtensionBridgeError('VALIDATION_TARGET_MISMATCH', 'BOSS greet intent must bind to the exact authorized job-detail URL', 409);
      }
      return;
    }
    if (!/^\/web\/geek\/chat(?:\/|$)/i.test(url.pathname) || !canonicalBossDetailUrl(intent.jobUrl)) {
      throw new BrowserExtensionBridgeError('VALIDATION_TARGET_MISMATCH', 'BOSS resume follow-up must bind one canonical BOSS job to the Geek chat surface', 409);
    }
  }

  private authorizeBossOutreachCommand(run: MutableValidationRun, command: BrowserExtensionDriverCommand): void {
    if (run.mode !== 'boss-outreach' || !run.bossOutreachIntent) return;
    const intent = run.bossOutreachIntent;
    if (command.type === 'navigate') {
      if (intent.operation !== 'greet' || !run.bossChatPrepared || !isBossChatUrl(command.payload.url)) {
        throw new BrowserExtensionBridgeError('VALIDATION_TARGET_DENIED', 'BOSS outreach navigation is allowed only from an authorized greet into Geek chat', 403);
      }
      return;
    }
    if (intent.operation === 'greet') {
      if (['boss_scan_unread_contacts', 'boss_open_contact', 'boss_prepare_resume', 'boss_confirm_resume'].includes(command.type)) {
        throw new BrowserExtensionBridgeError('VALIDATION_COMMAND_DENIED', `BOSS greet intent cannot execute '${command.type}'`, 403);
      }
      if (command.type === 'boss_prepare_chat' && run.bossChatPrepared) {
        throw new BrowserExtensionBridgeError('VALIDATION_COMMAND_DENIED', 'BOSS greet chat preparation is exactly-once', 409);
      }
      if (command.type === 'boss_send_message') {
        if (!run.bossChatPrepared || run.bossMessageSent) {
          throw new BrowserExtensionBridgeError('VALIDATION_COMMAND_DENIED', 'BOSS greeting send requires one prepared, unsent chat', 409);
        }
        if (command.payload.message !== intent.expectedMessage) {
          throw new BrowserExtensionBridgeError('VALIDATION_COMMAND_DENIED', 'BOSS greeting text differs from the server-authorized Job Harness greeting', 403);
        }
      }
      return;
    }

    if (['boss_detail_snapshot', 'boss_prepare_chat', 'boss_send_message'].includes(command.type)) {
      throw new BrowserExtensionBridgeError('VALIDATION_COMMAND_DENIED', `BOSS resume-followup intent cannot execute '${command.type}'`, 403);
    }
    if (command.type === 'boss_prepare_resume') {
      if (run.bossResumePrepared) {
        throw new BrowserExtensionBridgeError('VALIDATION_COMMAND_DENIED', 'BOSS resume chooser preparation is exactly-once', 409);
      }
      if (canonicalBossDetailUrl(command.payload.expectedJobUrl) !== canonicalBossDetailUrl(intent.jobUrl)) {
        throw new BrowserExtensionBridgeError('VALIDATION_COMMAND_DENIED', 'BOSS resume preparation job differs from the policy-authorized conversation job', 403);
      }
    }
    if (command.type === 'boss_confirm_resume') {
      if (!run.bossResumePrepared || run.bossResumeConfirmed) {
        throw new BrowserExtensionBridgeError('VALIDATION_COMMAND_DENIED', 'BOSS resume send requires one prepared, unconfirmed chooser', 409);
      }
      if (command.payload.resumeIndex !== intent.expectedResumeIndex) {
        throw new BrowserExtensionBridgeError('VALIDATION_COMMAND_DENIED', 'BOSS resume index differs from the server-authorized Resume Profile mapping', 403);
      }
      if (canonicalBossDetailUrl(command.payload.expectedJobUrl) !== canonicalBossDetailUrl(intent.jobUrl)) {
        throw new BrowserExtensionBridgeError('VALIDATION_COMMAND_DENIED', 'BOSS resume confirmation job differs from the policy-authorized conversation job', 403);
      }
    }
  }

  private authorizeBossDiscoveryCommand(run: MutableValidationRun, command: BrowserExtensionDriverCommand): void {
    if (run.mode !== 'boss-discovery') return;
    if (command.type === 'navigate') {
      if (!isBossDiscoveryNavigableUrl(command.payload.url)) {
        throw new BrowserExtensionBridgeError('VALIDATION_TARGET_DENIED', 'BOSS discovery navigation is restricted to the Geek search page and job-detail pages', 403);
      }
      return;
    }
    if (command.type === 'fill') {
      if (!BOSS_SEARCH_INPUT_SELECTORS.has(command.payload.selector)) {
        throw new BrowserExtensionBridgeError('VALIDATION_COMMAND_DENIED', 'BOSS discovery may fill only the allowlisted search input', 403);
      }
      return;
    }
    if (command.type === 'click') {
      const expected = command.payload.expectedText?.trim() ?? '';
      const fixedSearchButton = BOSS_SEARCH_BUTTON_SELECTORS.has(command.payload.selector) && (!expected || expected === '搜索');
      const scannedSearchAction = BOSS_SCANNED_ACTION_SELECTOR.test(command.payload.selector) && expected === '搜索';
      if (!fixedSearchButton && !scannedSearchAction) {
        throw new BrowserExtensionBridgeError('VALIDATION_COMMAND_DENIED', 'BOSS discovery may click only the explicit search action', 403);
      }
    }
  }

  private sameSite(left: string, right: string): boolean {
    try {
      const a = new URL(left); const b = new URL(right);
      return a.protocol === 'https:' && b.protocol === 'https:' && a.hostname.toLowerCase() === b.hostname.toLowerCase() && a.port === b.port;
    } catch { return false; }
  }

  private requireRun(id: string): MutableValidationRun {
    const run = this.runs.get(ValidationRunIdSchema.parse(id));
    if (!run) throw new BrowserExtensionBridgeError('VALIDATION_RUN_NOT_FOUND', 'Browser validation run was not found or expired', 404);
    return run;
  }

  private reap(): void {
    const now = this.now().toISOString();
    for (const [id, run] of this.runs) if (run.expiresAt <= now) this.runs.delete(id);
  }
}

export function registerBrowserExtensionValidationApi(
  app: Express,
  registry: BrowserExtensionValidationRegistry | null,
): void {
  app.post(`${BROWSER_EXTENSION_BRIDGE_PREFIX}/validation-runs`, validationRoute(async (req, res) => {
    if (!registry) throw new BrowserExtensionBridgeError('VALIDATION_DISABLED', 'Browser validation is not configured', 503);
    res.status(201).json(registry.create(req.body));
  }));
  app.get(`${BROWSER_EXTENSION_BRIDGE_PREFIX}/validation-runs`, validationRoute(async (_req, res) => {
    if (!registry) throw new BrowserExtensionBridgeError('VALIDATION_DISABLED', 'Browser validation is not configured', 503);
    res.json({ items: registry.list() });
  }));
  app.get(`${BROWSER_EXTENSION_BRIDGE_PREFIX}/validation-runs/:runId`, validationRoute(async (req, res) => {
    if (!registry) throw new BrowserExtensionBridgeError('VALIDATION_DISABLED', 'Browser validation is not configured', 503);
    const run = registry.get(pathId(req.params.runId));
    if (!run) throw new BrowserExtensionBridgeError('VALIDATION_RUN_NOT_FOUND', 'Browser validation run was not found or expired', 404);
    res.json(run);
  }));
  app.post(`${BROWSER_EXTENSION_BRIDGE_PREFIX}/validation-runs/:runId/invoke`, validationRoute(async (req, res) => {
    if (!registry) throw new BrowserExtensionBridgeError('VALIDATION_DISABLED', 'Browser validation is not configured', 503);
    res.json(await registry.invoke(pathId(req.params.runId), req.body));
  }));
  app.post(`${BROWSER_EXTENSION_BRIDGE_PREFIX}/validation-runs/:runId/prepare-resume`, validationRoute(async (req, res) => {
    if (!registry) throw new BrowserExtensionBridgeError('VALIDATION_DISABLED', 'Browser validation is not configured', 503);
    res.json(await registry.prepareResume(pathId(req.params.runId)));
  }));
  app.post(`${BROWSER_EXTENSION_BRIDGE_PREFIX}/validation-runs/:runId/sync-resume`, validationRoute(async (req, res) => {
    if (!registry) throw new BrowserExtensionBridgeError('VALIDATION_DISABLED', 'Browser validation is not configured', 503);
    res.json(await registry.syncResume(pathId(req.params.runId), req.body));
  }));
  app.post(`${BROWSER_EXTENSION_BRIDGE_PREFIX}/validation-runs/:runId/characterize`, validationRoute(async (req, res) => {
    if (!registry) throw new BrowserExtensionBridgeError('VALIDATION_DISABLED', 'Browser validation is not configured', 503);
    res.json(await registry.characterize(pathId(req.params.runId)));
  }));
}

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
function validationRoute(handler: AsyncHandler) {
  return (req: Request, res: Response) => { void handler(req, res).catch((error) => sendValidationError(res, error)); };
}
function pathId(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return ValidationRunIdSchema.parse(raw);
}
function sendValidationError(res: Response, error: unknown): void {
  if (writeCommonRestError(res, error)) return;
  if (error instanceof BrowserExtensionBridgeError) {
    writeRestError(res, error.status, error.code, error.message);
    return;
  }
  writeInternalRestError(res);
}
function freezeRun(run: MutableValidationRun): BrowserExtensionValidationRun {
  return {
    id: run.id,
    agentId: run.agentId,
    targetUrl: run.targetUrl,
    mode: run.mode,
    createdAt: run.createdAt,
    expiresAt: run.expiresAt,
    sessionRef: run.sessionRef,
    commandCount: run.commandCount,
    writeCount: run.writeCount,
    characterization: run.characterization,
    outreachOperation: run.bossOutreachIntent?.operation ?? null,
  };
}
function parseRawControls(raw: unknown): RawControl[] { return z.array(RawControlSchema).parse(raw); }
function parseRawActions(raw: unknown): RawAction[] { return z.array(RawActionSchema).parse(raw); }
function findResumeUploadControl(controls: readonly RawControl[]): RawControl | null {
  const scored = controls.filter((control) => control.kind === 'file' && !control.disabled).map((control) => {
    const evidence = [control.label, control.name ?? '', control.accept ?? '', ...control.semanticHints].join(' ').toLowerCase();
    const score = (/简历|resume|cv/.test(evidence) ? 4 : 0) + (/pdf|doc/.test(evidence) ? 2 : 0) + (/upload|file|附件/.test(evidence) ? 1 : 0);
    return { control, score };
  }).sort((a, b) => b.score - a.score);
  if (!scored.length || scored[0]!.score === 0 || (scored[1] && scored[1].score === scored[0]!.score)) return null;
  return scored[0]!.control;
}
function selectResumeUploadControl(raw: unknown): { controlRef: string; label: string; name: string | null; accept: string | null } {
  const selected = findResumeUploadControl(parseRawControls(raw));
  if (!selected) throw new BrowserExtensionBridgeError('VALIDATION_UPLOAD_AMBIGUOUS', 'Site Resume Sync requires one unambiguous resume file input', 409);
  return { controlRef: selected.controlRef, label: selected.label, name: selected.name ?? null, accept: selected.accept ?? null };
}
function uniqueSectionControl(controls: readonly RawControl[], sectionLabel: string, allowReadOnly = false): RawControl | null {
  const matches = controls.filter((control) => !control.disabled && (allowReadOnly || !control.readOnly) && (control.sectionLabel ?? '').replace(/\s+/g, '') === sectionLabel.replace(/\s+/g, ''));
  return matches.length === 1 ? matches[0]! : null;
}
function uniqueControlByMeaning(controls: readonly RawControl[], meaning: string, allowReadOnly = false): RawControl | null {
  const expected = meaning.replace(/\s+/g, '').toLowerCase();
  const matches = controls.filter((control) => {
    if (control.disabled || (!allowReadOnly && control.readOnly)) return false;
    const evidence = [control.label, control.sectionLabel ?? '', ...control.semanticHints]
      .map((value) => value.replace(/\s+/g, '').toLowerCase())
      .filter(Boolean);
    return evidence.some((value) => value === expected || value.includes(expected));
  });
  return matches.length === 1 ? matches[0]! : null;
}
function uniqueLiepinEducationMajorControl(controls: readonly RawControl[], schoolControl: RawControl | null): RawControl | null {
  const candidates = controls.filter((control) =>
    !control.disabled
    && !control.readOnly
    && control.controlRef !== schoolControl?.controlRef
    && ['text', 'select', 'unknown'].includes(control.kind)
    && !normalizedContains(control.label, '入学时间')
    && !normalizedContains(control.label, '毕业时间')
    && !normalizedContains(control.label, '在校经历'));
  return candidates.length === 1 ? candidates[0]! : null;
}
function uniqueControlByLabel(controls: readonly RawControl[], label: string, allowReadOnly = false): RawControl | null {
  const expected = label.replace(/\s+/g, '');
  const matches = controls.filter((control) => !control.disabled && (allowReadOnly || !control.readOnly) && control.label.replace(/\s+/g, '') === expected);
  return matches.length === 1 ? matches[0]! : null;
}
function uniqueActionByText(actions: readonly RawAction[], text: string): RawAction | null {
  const expected = text.replace(/\s+/g, ' ').trim();
  const matches = actions.filter((action) => !action.disabled && !action.ariaDisabled && action.text.replace(/\s+/g, ' ').trim() === expected);
  return matches.length === 1 ? matches[0]! : null;
}
function isBossSearchTarget(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return url.protocol === 'https:'
    && !url.username
    && !url.password
    && (host === 'zhipin.com' || host === 'www.zhipin.com')
    && /^\/web\/geek\/jobs?\/?$/i.test(url.pathname);
}

function isBossDiscoveryNavigableUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || (host !== 'zhipin.com' && host !== 'www.zhipin.com')) return false;
    return /^\/web\/geek\/jobs?\/?$/i.test(url.pathname)
      || /^\/job_detail\/[A-Za-z0-9._%-]+\.html$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function isBossDiscoveryCurrentUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || (host !== 'zhipin.com' && host !== 'www.zhipin.com')) return false;
    return /^\/web\/geek\/jobs?\/?$/i.test(url.pathname)
      || /^\/job_detail\/[A-Za-z0-9._%-]+\.html$/i.test(url.pathname)
      || /^\/web\/passport(?:\/|$)/i.test(url.pathname)
      || /^\/web\/user(?:\/|$)/i.test(url.pathname)
      || url.pathname === '/';
  } catch {
    return false;
  }
}

function isBossChatInspectCurrentUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || (host !== 'zhipin.com' && host !== 'www.zhipin.com')) return false;
    return /^\/web\/geek\/chat(?:\/|$)/i.test(url.pathname)
      || /^\/web\/passport(?:\/|$)/i.test(url.pathname)
      || /^\/web\/user(?:\/|$)/i.test(url.pathname)
      || url.pathname === '/';
  } catch {
    return false;
  }
}

function isBossOutreachTarget(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || (host !== 'zhipin.com' && host !== 'www.zhipin.com')) return false;
  return /^\/job_detail\/[A-Za-z0-9._%-]+\.html$/i.test(url.pathname)
    || /^\/web\/geek\/chat(?:\/|$)/i.test(url.pathname);
}

function canonicalBossDetailUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!isBossOutreachTarget(url) || !/^\/job_detail\//i.test(url.pathname)) return null;
    url.protocol = 'https:';
    url.hostname = 'www.zhipin.com';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function isBossChatUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && (host === 'zhipin.com' || host === 'www.zhipin.com')
      && /^\/web\/geek\/chat(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

function isBossOutreachCurrentUrl(raw: string, intent: BossOutreachIntent, targetUrl: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || (host !== 'zhipin.com' && host !== 'www.zhipin.com')) return false;
    if (/^\/web\/passport(?:\/|$)/i.test(url.pathname) || /^\/web\/user(?:\/|$)/i.test(url.pathname) || url.pathname === '/') return true;
    if (intent.operation === 'greet') {
      const currentJob = canonicalBossDetailUrl(raw);
      const targetJob = canonicalBossDetailUrl(targetUrl);
      return Boolean(currentJob && targetJob && currentJob === targetJob) || isBossChatUrl(raw);
    }
    return isBossChatUrl(raw);
  } catch {
    return false;
  }
}

function isSafeResumeManagementTarget(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if (host === 'c.liepin.com') return /^\/resume\/(?:create|edit)$/i.test(url.pathname);
    return false;
  } catch {
    return false;
  }
}

function isLiepinProfileOnboarding(currentUrl: string, bodyText: string): boolean {
  try {
    const url = new URL(currentUrl);
    const host = url.hostname.toLowerCase();
    if (host !== 'c.liepin.com' || !/^\/resume\/create\/?$/i.test(url.pathname)) return false;
    const markers = ['姓名', '性别', '出生年月', '求职身份', '当前城市', '下一步'];
    return markers.filter((marker) => bodyText.includes(marker)).length >= 5;
  } catch { return false; }
}
function isLiepinEducationOnboarding(currentUrl: string, bodyText: string): boolean {
  try {
    const url = new URL(currentUrl);
    const host = url.hostname.toLowerCase();
    if (host !== 'c.liepin.com' || !/^\/resume\/create\/?$/i.test(url.pathname)) return false;
    const markers = ['你就读的学校', '学校名称', '学历', '专业', '就读时间', '在校经历', '下一步'];
    return markers.filter((marker) => bodyText.includes(marker)).length >= 5;
  } catch { return false; }
}
function normalizedContains(haystack: string, needle: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[\s·•,，.。;；:_\-—–/\\()（）\[\]【】]+/g, '');
  const normalizedNeedle = normalize(needle);
  return Boolean(normalizedNeedle) && normalize(haystack).includes(normalizedNeedle);
}

function characterizedStateSignals(
  bodyText: string,
  controls: BrowserExtensionCharacterizationEvidence['controls'] = [],
): string[] {
  const signals = ['立即投递','投简历','继续沟通','已投递','已申请','选择简历','我的简历','在线简历','默认简历','附件简历','上传简历','聊一聊'];
  const observed = signals.filter((signal) => bodyText.includes(signal));
  const controlText = controls.map((control) => [control.label, control.name, control.description, ...control.semanticHints].filter(Boolean).join(' ')).join(' ');
  const loginMarkers = ['手机号','短信验证码','验证码'];
  const structuralLoginMarkers = loginMarkers.filter((signal) => bodyText.includes(signal) || controlText.includes(signal));
  if (structuralLoginMarkers.length >= 2) observed.unshift('需要登录');
  return observed;
}
function sanitizedHref(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { const url = new URL(value); return `${url.origin}${url.pathname}`.slice(0, 1000); } catch { return null; }
}
function sanitizeCharacterizationActions(value: unknown): BrowserExtensionCharacterizationEvidence['actions'] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 250).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    return [{
      tag: typeof record.tag === 'string' ? record.tag.slice(0, 30) : 'other',
      text: typeof record.text === 'string' ? record.text.replace(/\s+/g, ' ').trim().slice(0, 300) : '',
      href: sanitizedHref(record.href),
      type: typeof record.type === 'string' ? record.type.slice(0, 80) : null,
      role: typeof record.role === 'string' ? record.role.slice(0, 80) : null,
      disabled: record.disabled === true,
      ariaDisabled: record.ariaDisabled === true,
    }];
  });
}
function sanitizeCharacterizationControls(value: unknown): BrowserExtensionCharacterizationEvidence['controls'] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 250).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const optionLabels = Array.isArray(record.options) ? record.options.slice(0, 50).flatMap((option) => {
      if (!option || typeof option !== 'object' || Array.isArray(option)) return [];
      const label = (option as Record<string, unknown>).label;
      return typeof label === 'string' && label.trim() ? [label.replace(/\s+/g, ' ').trim().slice(0, 200)] : [];
    }) : [];
    return [{
      kind: typeof record.kind === 'string' ? record.kind.slice(0, 50) : 'unknown',
      label: typeof record.label === 'string' ? record.label.replace(/\s+/g, ' ').trim().slice(0, 300) : '',
      name: typeof record.name === 'string' ? record.name.slice(0, 200) : null,
      description: typeof record.description === 'string' ? record.description.replace(/\s+/g, ' ').trim().slice(0, 500) : null,
      required: record.required === true, disabled: record.disabled === true, readOnly: record.readOnly === true,
      optionLabels,
      semanticHints: Array.isArray(record.semanticHints) ? record.semanticHints.filter((hint): hint is string => typeof hint === 'string').slice(0, 20).map((hint) => hint.slice(0, 200)) : [],
      accept: typeof record.accept === 'string' ? record.accept.slice(0, 300) : null,
      multiple: record.multiple === true,
      sectionLabel: typeof record.sectionLabel === 'string' ? record.sectionLabel.replace(/\s+/g, ' ').trim().slice(0, 300) : null,
    }];
  });
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BrowserExtensionBridgeError('VALIDATION_AGENT_RESULT', `Browser extension ${label} result was invalid`, 502);
  return value as Record<string, unknown>;
}
function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new BrowserExtensionBridgeError('VALIDATION_AGENT_RESULT', `Browser extension ${label} result was invalid`, 502);
  return value;
}

function versionAtLeast(actual: string, minimum: string): boolean {
  const parse = (value: string) => value.split('.').slice(0, 3).map((part) => Number.parseInt(part, 10));
  const left = parse(actual);
  const right = parse(minimum);
  if (left.length < 3 || right.length < 3 || left.some((value) => !Number.isFinite(value)) || right.some((value) => !Number.isFinite(value))) return false;
  for (let index = 0; index < 3; index += 1) {
    if (left[index]! > right[index]!) return true;
    if (left[index]! < right[index]!) return false;
  }
  return true;
}
