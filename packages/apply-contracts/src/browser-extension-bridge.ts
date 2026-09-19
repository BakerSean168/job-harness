import { z } from 'zod';

const BridgeIdSchema = z.string().trim().min(1).max(200);
const BridgeIsoDateTimeSchema = z.iso.datetime({ offset: true });

export const BROWSER_EXTENSION_DRIVER_COMMANDS = [
  'session_acquire',
  'navigate',
  'current_url',
  'title',
  'body_text',
  'exists',
  'text',
  'value_matches',
  'fill',
  'select',
  'set_checked',
  'click',
  'upload',
  'wait',
  'scroll',
  'screenshot',
  'scan_controls',
  'scan_actions',
  'form_state_hash',
] as const;
export const BrowserExtensionDriverCommandTypeSchema = z.enum(BROWSER_EXTENSION_DRIVER_COMMANDS);

export const BrowserExtensionAgentCapabilitiesSchema = z.object({
  humanControl: z.boolean().default(true),
  persistentSession: z.boolean().default(true),
  resumeUpload: z.boolean().default(false),
  screenshots: z.boolean().default(false),
  driverCommands: z.array(BrowserExtensionDriverCommandTypeSchema).min(1).max(BROWSER_EXTENSION_DRIVER_COMMANDS.length),
}).strict();

export const BrowserExtensionAgentRegistrationSchema = z.object({
  agentId: BridgeIdSchema,
  name: z.string().trim().min(1).max(200),
  version: z.string().trim().min(1).max(100),
  browserName: z.string().trim().min(1).max(100).nullable().default(null),
  platform: z.string().trim().min(1).max(100).nullable().default(null),
  capabilities: BrowserExtensionAgentCapabilitiesSchema,
  registeredAt: BridgeIsoDateTimeSchema,
  lastSeenAt: BridgeIsoDateTimeSchema,
}).strict();

export const RegisterBrowserExtensionAgentInputSchema = BrowserExtensionAgentRegistrationSchema.omit({
  registeredAt: true,
  lastSeenAt: true,
});

export const BrowserExtensionAgentStatusSchema = BrowserExtensionAgentRegistrationSchema.extend({
  online: z.boolean(),
  queuedCommands: z.number().int().nonnegative(),
  inFlightCommands: z.number().int().nonnegative(),
}).strict();

const SessionAcquireCommandSchema = z.object({
  type: z.literal('session_acquire'),
  payload: z.object({ preferredUrl: z.url().nullable().default(null), reuseLiveSession: z.boolean().default(false), requireLiveSession: z.boolean().default(false) }).strict(),
}).strict();
const NavigateCommandSchema = z.object({ type: z.literal('navigate'), payload: z.object({ url: z.url() }).strict() }).strict();
const CurrentUrlCommandSchema = z.object({ type: z.literal('current_url'), payload: z.object({}).strict() }).strict();
const TitleCommandSchema = z.object({ type: z.literal('title'), payload: z.object({}).strict() }).strict();
const BodyTextCommandSchema = z.object({ type: z.literal('body_text'), payload: z.object({ limit: z.number().int().min(0).max(200_000).default(50_000) }).strict() }).strict();
const ExistsCommandSchema = z.object({ type: z.literal('exists'), payload: z.object({ selector: z.string().min(1).max(4000) }).strict() }).strict();
const TextCommandSchema = z.object({ type: z.literal('text'), payload: z.object({ selector: z.string().min(1).max(4000) }).strict() }).strict();
const ValueMatchesCommandSchema = z.object({ type: z.literal('value_matches'), payload: z.object({ selector: z.string().min(1).max(4000), expected: z.string().max(100_000) }).strict() }).strict();
const FillCommandSchema = z.object({ type: z.literal('fill'), payload: z.object({ selector: z.string().min(1).max(4000), value: z.string().max(100_000), blur: z.boolean().optional() }).strict() }).strict();
const SelectCommandSchema = z.object({
  type: z.literal('select'),
  payload: z.object({ selector: z.string().min(1).max(4000), value: z.union([z.string().max(10_000), z.array(z.string().max(10_000)).max(500)]) }).strict(),
}).strict();
const SetCheckedCommandSchema = z.object({ type: z.literal('set_checked'), payload: z.object({ selector: z.string().min(1).max(4000), checked: z.boolean() }).strict() }).strict();
const ClickCommandSchema = z.object({ type: z.literal('click'), payload: z.object({ selector: z.string().min(1).max(4000), expectedText: z.string().trim().min(1).max(500).nullable().default(null) }).strict() }).strict();
const UploadCommandSchema = z.object({
  type: z.literal('upload'),
  payload: z.object({
    selector: z.string().min(1).max(4000),
    file: z.object({
      name: z.string().trim().min(1).max(500),
      mimeType: z.string().trim().min(1).max(200),
      bytesBase64: z.string().max(20_000_000),
    }).strict(),
  }).strict(),
}).strict();
const WaitCommandSchema = z.object({ type: z.literal('wait'), payload: z.object({ milliseconds: z.number().int().min(0).max(60_000) }).strict() }).strict();
const ScrollCommandSchema = z.object({ type: z.literal('scroll'), payload: z.object({ deltaY: z.number().int().min(-20_000).max(20_000) }).strict() }).strict();
const ScreenshotCommandSchema = z.object({ type: z.literal('screenshot'), payload: z.object({}).strict() }).strict();
const ScanControlsCommandSchema = z.object({ type: z.literal('scan_controls'), payload: z.object({}).strict() }).strict();
const ScanActionsCommandSchema = z.object({ type: z.literal('scan_actions'), payload: z.object({}).strict() }).strict();
const FormStateHashCommandSchema = z.object({ type: z.literal('form_state_hash'), payload: z.object({}).strict() }).strict();

export const BrowserExtensionDriverCommandSchema = z.discriminatedUnion('type', [
  SessionAcquireCommandSchema,
  NavigateCommandSchema,
  CurrentUrlCommandSchema,
  TitleCommandSchema,
  BodyTextCommandSchema,
  ExistsCommandSchema,
  TextCommandSchema,
  ValueMatchesCommandSchema,
  FillCommandSchema,
  SelectCommandSchema,
  SetCheckedCommandSchema,
  ClickCommandSchema,
  UploadCommandSchema,
  WaitCommandSchema,
  ScrollCommandSchema,
  ScreenshotCommandSchema,
  ScanControlsCommandSchema,
  ScanActionsCommandSchema,
  FormStateHashCommandSchema,
]);


export const CreateBrowserExtensionPairingOutputSchema = z.object({
  code: z.string().regex(/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/),
  expiresAt: BridgeIsoDateTimeSchema,
}).strict();

export const PairBrowserExtensionAgentInputSchema = RegisterBrowserExtensionAgentInputSchema.extend({
  pairingCode: z.string().trim().min(1).max(100),
}).strict();

export const PairBrowserExtensionAgentOutputSchema = z.object({
  agentToken: z.string().trim().min(32),
  tokenExpiresAt: BridgeIsoDateTimeSchema,
  agent: BrowserExtensionAgentStatusSchema,
}).strict();

export const BrowserExtensionCommandEnvelopeSchema = z.object({
  commandId: BridgeIdSchema,
  agentId: BridgeIdSchema,
  sessionRef: z.string().trim().min(1).max(500).nullable().default(null),
  command: BrowserExtensionDriverCommandSchema,
  createdAt: BridgeIsoDateTimeSchema,
  expiresAt: BridgeIsoDateTimeSchema,
}).strict();


export const BrowserExtensionExecutionScopeSchema = z.object({
  attemptId: BridgeIdSchema,
  executorId: BridgeIdSchema,
  leaseToken: z.string().min(32).max(500),
}).strict();

export const InvokeBrowserExtensionCommandInputSchema = z.object({
  agentId: BridgeIdSchema,
  sessionRef: z.string().trim().min(1).max(500).nullable().default(null),
  command: BrowserExtensionDriverCommandSchema,
  timeoutMs: z.number().int().min(1_000).max(60_000).default(30_000),
}).strict();

export const InvokeScopedBrowserExtensionCommandInputSchema = InvokeBrowserExtensionCommandInputSchema.extend({
  scope: BrowserExtensionExecutionScopeSchema,
}).strict();

export const PollBrowserExtensionCommandInputSchema = z.object({
  waitMs: z.number().int().min(0).max(25_000).default(20_000),
}).strict();

export const BrowserExtensionCommandResultInputSchema = z.object({
  commandId: BridgeIdSchema,
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().trim().min(1).max(4000).nullable().default(null),
}).strict().superRefine((value, ctx) => {
  if (value.ok && value.error) ctx.addIssue({ code: 'custom', path: ['error'], message: 'successful command result cannot contain error' });
  if (!value.ok && !value.error) ctx.addIssue({ code: 'custom', path: ['error'], message: 'failed command result requires error' });
});

export const InvokeBrowserExtensionCommandOutputSchema = z.object({
  commandId: BridgeIdSchema,
  result: z.unknown(),
}).strict();

export const PollBrowserExtensionCommandOutputSchema = z.object({
  command: BrowserExtensionCommandEnvelopeSchema.nullable(),
}).strict();

export type BrowserExtensionDriverCommandType = z.infer<typeof BrowserExtensionDriverCommandTypeSchema>;
export type BrowserExtensionDriverCommand = z.infer<typeof BrowserExtensionDriverCommandSchema>;
export type BrowserExtensionAgentCapabilities = z.infer<typeof BrowserExtensionAgentCapabilitiesSchema>;
export type BrowserExtensionAgentRegistration = z.infer<typeof BrowserExtensionAgentRegistrationSchema>;
export type BrowserExtensionAgentStatus = z.infer<typeof BrowserExtensionAgentStatusSchema>;
export type CreateBrowserExtensionPairingOutput = z.infer<typeof CreateBrowserExtensionPairingOutputSchema>;
export type PairBrowserExtensionAgentInput = z.input<typeof PairBrowserExtensionAgentInputSchema>;
export type PairBrowserExtensionAgentOutput = z.infer<typeof PairBrowserExtensionAgentOutputSchema>;
export type RegisterBrowserExtensionAgentInput = z.input<typeof RegisterBrowserExtensionAgentInputSchema>;
export type BrowserExtensionCommandEnvelope = z.infer<typeof BrowserExtensionCommandEnvelopeSchema>;
export type BrowserExtensionExecutionScope = z.infer<typeof BrowserExtensionExecutionScopeSchema>;
export type InvokeBrowserExtensionCommandInput = z.input<typeof InvokeBrowserExtensionCommandInputSchema>;
export type InvokeScopedBrowserExtensionCommandInput = z.input<typeof InvokeScopedBrowserExtensionCommandInputSchema>;
export type PollBrowserExtensionCommandInput = z.input<typeof PollBrowserExtensionCommandInputSchema>;
export type BrowserExtensionCommandResultInput = z.input<typeof BrowserExtensionCommandResultInputSchema>;
