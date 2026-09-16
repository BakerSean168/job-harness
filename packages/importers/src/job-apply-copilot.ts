import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CareerRuntimePorts } from '@job-harness/application';
import type { JobSourceKind, JobState } from '@job-harness/domain';
import { normalizeIdentityText } from '@job-harness/domain';
import type { ResumeProfileRef, UpsertJobCandidate } from '@job-harness/contracts';

const LegacyApplicationRowSchema = z.object({
  at: z.string().min(1),
  url: z.string().optional(),
  canonicalUrl: z.string().optional(),
  company: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(['applied', 'contacted', 'reviewed', 'shortlisted', 'skipped']),
  profile: z.string().optional(),
  platform: z.string().optional(),
  reason: z.string().optional(),
  evidence: z.string().optional(),
  applicationStatus: z.string().optional(),
  appliedDate: z.string().optional(),
  recipient: z.string().optional(),
}).passthrough();

const LegacyPoolReadyRowSchema = z.object({
  id: z.string().optional(),
  company: z.string().min(1),
  title: z.string().min(1),
  city: z.string().optional(),
  resumeProfile: z.string().optional(),
  channel: z.string().optional(),
  applicationChannel: z.string().optional(),
  sourceUrl: z.string().optional(),
  officialUrl: z.string().optional(),
  apply: z.object({ officialUrl: z.string().optional() }).passthrough().optional(),
  jd: z.object({ responsibilities: z.array(z.string()).optional(), requirements: z.array(z.string()).optional() }).passthrough().optional(),
  status: z.string().optional(),
  appliedAt: z.string().optional(),
  atsState: z.string().optional(),
  nextAction: z.string().optional(),
  notes: z.string().optional(),
  eligibility: z.string().optional(),
  signals: z.array(z.string()).optional(),
  reason: z.string().optional(),
}).passthrough();

const LegacyPoolSchema = z.object({
  schemaVersion: z.number().optional(),
  verifiedAt: z.string().optional(),
  ready: z.array(LegacyPoolReadyRowSchema).default([]),
  verifyFirst: z.array(LegacyPoolReadyRowSchema).default([]),
}).passthrough();

export type LegacyApplicationRow = z.infer<typeof LegacyApplicationRowSchema>;
export type LegacyPoolRow = z.infer<typeof LegacyPoolReadyRowSchema>;

export interface LegacyJobApplyCopilotDataset {
  readonly applications: readonly LegacyApplicationRow[];
  readonly pool: z.infer<typeof LegacyPoolSchema>;
}

export interface LegacyImportOptions {
  readonly resumes?: readonly ResumeProfileRef[];
  readonly importedAt: string;
  readonly sourceLabel?: string;
}

export interface LegacyImportReport {
  readonly discoveryRunId: string;
  readonly alreadyImported: boolean;
  readonly sourceRows: number;
  readonly poolRows: number;
  readonly jobsInserted: number;
  readonly jobsUpdated: number;
  readonly jobsDuplicate: number;
  readonly jobsRejected: number;
  readonly stateUpdates: number;
  readonly applicationsRecorded: number;
  readonly applicationsScreening: number;
  readonly resumesSynced: number;
}

export function parseLegacyApplicationsJsonl(text: string): LegacyApplicationRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return LegacyApplicationRowSchema.parse(JSON.parse(line));
      } catch (error) {
        throw new Error(`Invalid legacy applications.jsonl line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
}

export function parseLegacyApplicationPool(text: string): z.infer<typeof LegacyPoolSchema> {
  return LegacyPoolSchema.parse(JSON.parse(text));
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

function identity(company: string, title: string): string {
  return `${normalizeIdentityText(company)}\u0000${normalizeIdentityText(title)}`;
}

function sourceKind(platform?: string): JobSourceKind {
  const value = (platform ?? '').toLowerCase();
  if (value.includes('zhaopin')) return 'zhilian';
  if (value.includes('liepin')) return 'liepin';
  if (value.includes('boss')) return 'boss';
  if (value.includes('moka')) return 'moka';
  if (value.includes('email')) return 'email';
  if (value.includes('official')) return 'official';
  if (value.includes('greenhouse')) return 'greenhouse';
  if (value.includes('lever')) return 'lever';
  if (value.includes('ashby')) return 'ashby';
  if (value.includes('job.') || value.includes('jobs.') || value.includes('careers.') || value.includes('join.qq') || value.includes('campus.jobs')) return 'official';
  return 'other';
}

function jobSpecificUrl(raw?: string): string | null {
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  const value = `${url.pathname}${url.search}${url.hash}`.toLowerCase();
  const looksSpecific = /position|jobdetail|job\/|jobs\/|vacancy|recruit.*id|positionid|jobid|\/apply/.test(value);
  return looksSpecific ? url.toString() : null;
}

function poolDescription(row: LegacyPoolRow): string | null {
  const lines: string[] = [];
  if (row.eligibility) lines.push(`Eligibility: ${row.eligibility}`);
  if (row.signals?.length) lines.push(`Signals: ${row.signals.join(', ')}`);
  if (row.jd?.responsibilities?.length) lines.push(`Responsibilities: ${row.jd.responsibilities.join(' | ')}`);
  if (row.jd?.requirements?.length) lines.push(`Requirements: ${row.jd.requirements.join(' | ')}`);
  if (row.nextAction) lines.push(`Legacy next action: ${row.nextAction}`);
  if (row.notes) lines.push(`Legacy note: ${row.notes}`);
  if (row.reason) lines.push(`Legacy reason: ${row.reason}`);
  return lines.length ? lines.join('\n') : null;
}

function stateFromPoolStatus(status?: string): JobState {
  const value = (status ?? '').toLowerCase();
  if (value.includes('closed') || value.includes('stale')) return 'closed';
  if (value.includes('mismatch') || value === 'skipped') return 'ignored';
  if (value.includes('superseded') || value.includes('covered-by') || value.includes('hold-') || value.includes('slots-filled')) return 'archived';
  if (value === 'applied' || value.includes('ready') || value.includes('manual') || value.includes('login-required') || value.includes('verify-')) return 'shortlisted';
  return 'discovered';
}

function stateFromApplication(row: LegacyApplicationRow): JobState {
  if (row.status === 'skipped') {
    return /关闭|失效|closed|404|not found/i.test(row.reason ?? '') ? 'closed' : 'ignored';
  }
  if (row.status === 'applied' || row.status === 'contacted' || row.status === 'shortlisted') return 'shortlisted';
  return 'discovered';
}

function buildLegacyNote(row: LegacyApplicationRow): string | null {
  const lines = [
    row.applicationStatus ? `Legacy application status: ${row.applicationStatus}` : null,
    row.profile ? `Resume profile: ${row.profile}` : null,
    row.evidence ? `Evidence: ${row.evidence}` : null,
    row.reason ? `Reason: ${row.reason}` : null,
    row.recipient ? `Recipient: ${row.recipient}` : null,
    `Imported from legacy record at ${row.at}`,
  ].filter((value): value is string => Boolean(value));
  return lines.length ? lines.join('\n') : null;
}

function toCandidate(
  company: string,
  title: string,
  observedAt: string,
  discoveryRunId: string,
  options: {
    city?: string | undefined;
    url?: string | undefined;
    platform?: string | undefined;
    poolId?: string | undefined;
    description?: string | null;
    additionalSources?: ReadonlyArray<{ url?: string | undefined; platform?: string | undefined }>;
  },
): UpsertJobCandidate {
  let url: string | undefined;
  if (options.url) {
    try { url = new URL(options.url).toString(); } catch { url = undefined; }
  }
  const sources = [{ url, platform: options.platform }, ...(options.additionalSources ?? [])]
    .map((source) => {
      let validUrl: string | undefined;
      if (source.url) {
        try { validUrl = new URL(source.url).toString(); } catch { validUrl = undefined; }
      }
      return {
        kind: sourceKind(source.platform),
        ...(validUrl ? { url: validUrl } : {}),
        ...(source.platform ? { label: source.platform } : {}),
      };
    });
  const uniqueSources = sources.filter((source, index) =>
    sources.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(source)) === index,
  );
  return {
    companyName: company,
    title,
    city: options.city ?? null,
    canonicalUrl: jobSpecificUrl(url),
    externalIdentities: options.poolId ? [{ source: 'job-apply-copilot-pool', externalId: options.poolId }] : [],
    sources: uniqueSources,
    description: options.description ?? null,
    observedAt,
    discoveryRunId,
  };
}

async function setImportedState(
  career: CareerRuntimePorts,
  jobId: string,
  state: JobState,
  source: unknown,
): Promise<boolean> {
  const current = await career.jobs.getJob(jobId);
  if (!current || current.state === state) return false;
  try {
    await career.jobs.setJobState({
      jobId,
      state,
      idempotencyKey: `legacy-state:${digest(source)}`,
    });
    return true;
  } catch {
    // Historical snapshots are not guaranteed to arrive in lifecycle order. If a
    // later terminal state cannot transition from the current state, preserve the
    // already-imported truth rather than bypassing lifecycle validation.
    return false;
  }
}

export async function importLegacyJobApplyCopilot(
  dataset: LegacyJobApplyCopilotDataset,
  career: CareerRuntimePorts,
  options: LegacyImportOptions,
): Promise<LegacyImportReport> {
  const sourceLabel = options.sourceLabel ?? 'job-apply-copilot';
  const poolRows = [...dataset.pool.ready, ...dataset.pool.verifyFirst];
  const importFingerprint = digest({
    applications: dataset.applications,
    poolRows,
    resumes: options.resumes?.map((resume) => ({ id: resume.id, version: resume.version, hash: resume.hash, artifactUri: resume.artifactUri })) ?? [],
  });
  const run = await career.discovery.beginDiscoveryRun({
    executor: 'import',
    contextSnapshot: {
      source: sourceLabel,
      schemaVersion: dataset.pool.schemaVersion ?? null,
      verifiedAt: dataset.pool.verifiedAt ?? null,
      fingerprint: importFingerprint,
    },
    startedAt: options.importedAt,
    idempotencyKey: `legacy-import:${importFingerprint}`,
  });

  if (run.completedAt) {
    return {
      discoveryRunId: run.id,
      alreadyImported: true,
      sourceRows: dataset.applications.length,
      poolRows: poolRows.length,
      jobsInserted: run.insertedCount,
      jobsUpdated: 0,
      jobsDuplicate: run.duplicateCount,
      jobsRejected: run.rejectedCount,
      stateUpdates: 0,
      applicationsRecorded: 0,
      applicationsScreening: 0,
      resumesSynced: 0,
    };
  }

  const resumesSynced = options.resumes?.length
    ? (await career.resumeRegistry.syncResumeProfiles(options.resumes)).synced
    : 0;

  const poolByIdentity = new Map<string, LegacyPoolRow>();
  for (const row of poolRows) poolByIdentity.set(identity(row.company, row.title), row);

  let jobsInserted = 0;
  let jobsUpdated = 0;
  let jobsDuplicate = 0;
  let jobsRejected = 0;
  let stateUpdates = 0;
  const jobIds = new Map<string, string>();

  for (const row of poolRows) {
    const candidate = toCandidate(row.company, row.title, dataset.pool.verifiedAt ?? options.importedAt, run.id, {
      city: row.city,
      url: row.apply?.officialUrl ?? row.officialUrl ?? row.sourceUrl,
      platform: (row.apply?.officialUrl ?? row.officialUrl) ? 'official' : (row.channel ?? row.applicationChannel),
      poolId: row.id,
      description: poolDescription(row),
      additionalSources: row.sourceUrl && row.sourceUrl !== (row.apply?.officialUrl ?? row.officialUrl)
        ? [{ url: row.sourceUrl, platform: row.channel ?? row.applicationChannel }]
        : [],
    });
    const result = (await career.jobs.upsertJobsBatch({ jobs: [candidate] })).items[0]!;
    if (result.status === 'inserted') jobsInserted += 1;
    else if (result.status === 'updated') jobsUpdated += 1;
    else if (result.status === 'duplicate') jobsDuplicate += 1;
    else jobsRejected += 1;
    if (result.jobId) {
      jobIds.set(identity(row.company, row.title), result.jobId);
    }
  }

  // Import every historical row as an observation. Repeated rows intentionally
  // become repeated observations while dedupe keeps one durable Job.
  const sortedApplications = [...dataset.applications].sort((a, b) => a.at.localeCompare(b.at));
  for (const row of sortedApplications) {
    const pool = poolByIdentity.get(identity(row.company, row.title));
    const candidate = toCandidate(row.company, row.title, row.at, run.id, {
      city: pool?.city,
      url: row.canonicalUrl ?? row.url ?? pool?.apply?.officialUrl ?? pool?.officialUrl ?? pool?.sourceUrl,
      platform: row.platform ?? pool?.channel ?? pool?.applicationChannel,
      poolId: pool?.id,
      description: pool ? poolDescription(pool) : null,
      additionalSources: pool
        ? [
            ...(pool.apply?.officialUrl ? [{ url: pool.apply.officialUrl, platform: 'official' }] : []),
            ...(pool.officialUrl ? [{ url: pool.officialUrl, platform: 'official' }] : []),
            ...(pool.sourceUrl ? [{ url: pool.sourceUrl, platform: pool.channel ?? pool.applicationChannel }] : []),
          ]
        : [],
    });
    const result = (await career.jobs.upsertJobsBatch({ jobs: [candidate] })).items[0]!;
    if (result.status === 'inserted') jobsInserted += 1;
    else if (result.status === 'updated') jobsUpdated += 1;
    else if (result.status === 'duplicate') jobsDuplicate += 1;
    else jobsRejected += 1;
    if (result.jobId) {
      jobIds.set(identity(row.company, row.title), result.jobId);
      if (await setImportedState(career, result.jobId, stateFromApplication(row), row)) stateUpdates += 1;
    }
  }

  // The pool is the latest verified snapshot, so reconcile its state after replaying
  // historical observations. Re-open terminal states through discovered when needed.
  for (const row of poolRows) {
    const jobId = jobIds.get(identity(row.company, row.title));
    if (!jobId) continue;
    const target = stateFromPoolStatus(row.status);
    let current = await career.jobs.getJob(jobId);
    if (!current || current.state === target) continue;
    if ((current.state === 'closed' || current.state === 'archived') && target === 'shortlisted') {
      if (await setImportedState(career, jobId, 'discovered', { row, migrationStep: 'reopen' })) stateUpdates += 1;
      current = await career.jobs.getJob(jobId);
    }
    if (current && current.state !== target && await setImportedState(career, jobId, target, { row, migrationStep: 'pool-current' })) stateUpdates += 1;
  }

  const appliedByIdentity = new Map<string, LegacyApplicationRow>();
  for (const row of sortedApplications) {
    if (row.status !== 'applied') continue;
    const key = identity(row.company, row.title);
    if (!appliedByIdentity.has(key)) appliedByIdentity.set(key, row);
  }

  const existingApplications = await career.applications.listApplications({ limit: 200, offset: 0 });
  const applicationByJob = new Map(existingApplications.items.map((item) => [item.application.jobId, item.application.id]));
  let applicationsRecorded = 0;
  let applicationsScreening = 0;

  for (const [key, row] of appliedByIdentity) {
    const jobId = jobIds.get(key);
    if (!jobId) continue;
    let applicationId = applicationByJob.get(jobId);
    if (!applicationId) {
      const appliedAt = row.appliedDate
        ? `${row.appliedDate}T00:00:00.000Z`
        : row.at;
      const profileCandidate = row.profile ?? poolByIdentity.get(key)?.resumeProfile;
      const profileId = profileCandidate && options.resumes?.some((resume) => resume.id === profileCandidate)
        ? profileCandidate
        : null;
      const detail = await career.applications.recordApplication({
        jobId,
        appliedAt,
        resumeProfileId: profileId,
        idempotencyKey: `legacy-application:${digest({ key, appliedAt })}`,
        actor: 'import',
        note: buildLegacyNote(row),
      });
      applicationId = detail.application.id;
      applicationByJob.set(jobId, applicationId);
      applicationsRecorded += 1;
    }

    const latest = [...sortedApplications].reverse().find((candidate) => identity(candidate.company, candidate.title) === key && candidate.status === 'applied');
    if (latest?.applicationStatus?.includes('筛选')) {
      const current = await career.applications.getApplication(applicationId);
      if (current?.application.currentStage === 'applied') {
        await career.applications.transitionApplication({
          applicationId,
          toStage: 'screening',
          occurredAt: latest.at,
          idempotencyKey: `legacy-screening:${digest({ key, at: latest.at })}`,
          actor: 'import',
          note: buildLegacyNote(latest),
        });
        applicationsScreening += 1;
      }
    }
  }

  // Pool may know an application that applications.jsonl did not preserve.
  for (const row of poolRows.filter((item) => item.status === 'applied')) {
    const key = identity(row.company, row.title);
    const jobId = jobIds.get(key);
    if (!jobId || applicationByJob.has(jobId)) continue;
    const profileId = row.resumeProfile && options.resumes?.some((resume) => resume.id === row.resumeProfile)
      ? row.resumeProfile
      : null;
    const appliedAt = row.appliedAt ?? options.importedAt;
    const detail = await career.applications.recordApplication({
      jobId,
      appliedAt,
      resumeProfileId: profileId,
      idempotencyKey: `legacy-pool-application:${digest({ key, appliedAt })}`,
      actor: 'import',
      note: [row.atsState, row.notes, row.nextAction].filter(Boolean).join('\n') || null,
    });
    applicationByJob.set(jobId, detail.application.id);
    applicationsRecorded += 1;
  }

  await career.discovery.completeDiscoveryRun({
    runId: run.id,
    completedAt: options.importedAt,
    candidateCount: poolRows.length + dataset.applications.length,
    insertedCount: jobsInserted,
    duplicateCount: jobsDuplicate,
    rejectedCount: jobsRejected,
  });

  return {
    discoveryRunId: run.id,
    alreadyImported: false,
    sourceRows: dataset.applications.length,
    poolRows: poolRows.length,
    jobsInserted,
    jobsUpdated,
    jobsDuplicate,
    jobsRejected,
    stateUpdates,
    applicationsRecorded,
    applicationsScreening,
    resumesSynced,
  };
}
