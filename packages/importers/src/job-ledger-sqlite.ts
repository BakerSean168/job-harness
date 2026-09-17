import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type {
  Job,
  JobListing,
  JobListingCandidate,
  UpsertJobCandidate,
} from '@job-harness/contracts';
import type { CareerRuntimePorts } from '@job-harness/application';
import { normalizeCanonicalUrl, normalizeIdentityText, type JobSourceKind, type JobState } from '@job-harness/domain';

export interface LegacyLedgerJob {
  readonly id: number;
  readonly company: string;
  readonly title: string;
  readonly city: string;
  readonly graduation: string;
  readonly experience: string;
  readonly aiHighlights: string;
  readonly status: string;
  readonly suppressedFromPrimary: boolean;
  readonly notes: string;
  readonly firstDiscoveredAt: string;
  readonly lastSeenAt: string;
}

export interface LegacyLedgerSource {
  readonly id: number;
  readonly jobId: number;
  readonly source: string;
  readonly sourceKind: string;
  readonly url: string;
  readonly externalJobId: string | null;
  readonly contactEmail: string;
  readonly rawJson: string;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
}

export interface LegacyLedgerRun {
  readonly runId: string;
  readonly ranAt: string;
  readonly scope: string;
  readonly source: string;
  readonly resultCount: number;
  readonly newCount: number;
  readonly metadataJson: string;
}

export interface LegacyLedgerEvent {
  readonly id: number;
  readonly runId: string | null;
  readonly jobId: number;
  readonly seenAt: string;
  readonly isNew: boolean;
  readonly source: string;
  readonly query: string;
}

export interface LegacyLedgerApplicationEvidence {
  readonly id: number;
  readonly jobId: number | null;
  readonly company: string;
  readonly title: string | null;
  readonly city: string | null;
  readonly status: string;
  readonly appliedAt: string;
  readonly platform: string;
  readonly profileId: string;
  readonly resumeName: string;
  readonly externalRef: string;
  readonly notes: string;
  readonly createdAt: string;
}

export interface LegacyLedgerCompanyLock {
  readonly company: string;
  readonly reason: string;
  readonly lockedAt: string;
  readonly expiresAt: string | null;
  readonly notes: string;
}

export interface LegacyCentralLedgerDataset {
  readonly jobs: readonly LegacyLedgerJob[];
  readonly sources: readonly LegacyLedgerSource[];
  readonly runs: readonly LegacyLedgerRun[];
  readonly events: readonly LegacyLedgerEvent[];
  readonly applications: readonly LegacyLedgerApplicationEvidence[];
  readonly companyLocks: readonly LegacyLedgerCompanyLock[];
  readonly fingerprint: string;
}

export interface LegacyCentralLedgerImportOptions {
  readonly importedAt: string;
  readonly campaignId?: string;
  readonly sourceLabel?: string;
}

export interface LegacyCentralLedgerImportReport {
  readonly fingerprint: string;
  readonly sourceJobs: number;
  readonly sourceRuns: number;
  readonly sourceEvents: number;
  readonly sourceApplications: number;
  readonly sourceCompanyLocks: number;
  readonly runsImported: number;
  readonly runsAlreadyImported: number;
  readonly jobsInserted: number;
  readonly jobsUpdated: number;
  readonly jobsDuplicate: number;
  readonly jobsRejected: number;
  readonly jobsAdoptedByLegacyEvidence: number;
  readonly stateUpdates: number;
  readonly applicationEvidenceCovered: number;
  readonly applicationEvidenceUnresolved: number;
  readonly applicationEvidence: readonly {
    legacyApplicationId: number;
    company: string;
    status: 'covered-by-existing-application' | 'unresolved';
    matchingApplicationIds: readonly string[];
  }[];
}

type SqlRow = Record<string, unknown>;

function text(value: unknown): string {
  return value == null ? '' : String(value);
}

function nullableText(value: unknown): string | null {
  const result = text(value).trim();
  return result ? result : null;
}

function number(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Expected finite number, received '${String(value)}'`);
  return parsed;
}

function bool(value: unknown): boolean {
  return number(value) !== 0;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function digest(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function safeJson(value: string): unknown {
  if (!value.trim()) return null;
  try { return JSON.parse(value) as unknown; } catch { return value; }
}

export function readLegacyCentralJobLedger(databasePath: string): LegacyCentralLedgerDataset {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  db.exec('PRAGMA query_only = ON');
  try {
    const jobs = (db.prepare(`
      SELECT j.*, c.canonical_name AS company
      FROM jobs j JOIN companies c ON c.id = j.company_id
      ORDER BY j.id
    `).all() as SqlRow[]).map((row): LegacyLedgerJob => ({
      id: number(row.id), company: text(row.company), title: text(row.title), city: text(row.city),
      graduation: text(row.graduation), experience: text(row.experience), aiHighlights: text(row.ai_highlights),
      status: text(row.status), suppressedFromPrimary: bool(row.suppressed_from_primary), notes: text(row.notes),
      firstDiscoveredAt: text(row.first_discovered_at), lastSeenAt: text(row.last_seen_at),
    }));
    const sources = (db.prepare('SELECT * FROM job_sources ORDER BY id').all() as SqlRow[]).map((row): LegacyLedgerSource => ({
      id: number(row.id), jobId: number(row.job_id), source: text(row.source), sourceKind: text(row.source_kind), url: text(row.url),
      externalJobId: nullableText(row.external_job_id), contactEmail: text(row.contact_email), rawJson: text(row.raw_json),
      firstSeenAt: text(row.first_seen_at), lastSeenAt: text(row.last_seen_at),
    }));
    const runs = (db.prepare('SELECT * FROM discovery_runs ORDER BY ran_at, run_id').all() as SqlRow[]).map((row): LegacyLedgerRun => ({
      runId: text(row.run_id), ranAt: text(row.ran_at), scope: text(row.scope), source: text(row.source), resultCount: number(row.result_count),
      newCount: number(row.new_count), metadataJson: text(row.metadata_json),
    }));
    const events = (db.prepare('SELECT * FROM discovery_events ORDER BY seen_at, id').all() as SqlRow[]).map((row): LegacyLedgerEvent => ({
      id: number(row.id), runId: nullableText(row.run_id), jobId: number(row.job_id), seenAt: text(row.seen_at), isNew: bool(row.is_new),
      source: text(row.source), query: text(row.query),
    }));
    const applications = (db.prepare(`
      SELECT a.*, c.canonical_name AS company, j.title AS title, j.city AS city
      FROM applications a JOIN companies c ON c.id = a.company_id
      LEFT JOIN jobs j ON j.id = a.job_id
      ORDER BY a.id
    `).all() as SqlRow[]).map((row): LegacyLedgerApplicationEvidence => ({
      id: number(row.id), jobId: row.job_id == null ? null : number(row.job_id), company: text(row.company),
      title: nullableText(row.title), city: nullableText(row.city), status: text(row.status), appliedAt: text(row.applied_at),
      platform: text(row.platform), profileId: text(row.profile_id), resumeName: text(row.resume_name), externalRef: text(row.external_ref),
      notes: text(row.notes), createdAt: text(row.created_at),
    }));
    const companyLocks = (db.prepare(`
      SELECT l.*, c.canonical_name AS company
      FROM company_application_locks l JOIN companies c ON c.id = l.company_id
      ORDER BY c.canonical_name
    `).all() as SqlRow[]).map((row): LegacyLedgerCompanyLock => ({
      company: text(row.company), reason: text(row.reason), lockedAt: text(row.locked_at), expiresAt: nullableText(row.expires_at), notes: text(row.notes),
    }));
    const body = { jobs, sources, runs, events, applications, companyLocks };
    return { ...body, fingerprint: digest(body) };
  } finally {
    db.close();
  }
}

function mapSourceKind(source: LegacyLedgerSource): JobSourceKind {
  const value = `${source.sourceKind} ${source.source} ${source.url}`.toLowerCase();
  if (value.includes('boss')) return 'boss';
  if (value.includes('智联') || value.includes('zhaopin')) return 'zhilian';
  if (value.includes('猎聘') || value.includes('liepin')) return 'liepin';
  if (value.includes('moka')) return 'moka';
  if (value.includes('greenhouse')) return 'greenhouse';
  if (value.includes('lever')) return 'lever';
  if (value.includes('ashby')) return 'ashby';
  if (source.sourceKind === 'email') return 'email';
  if (source.sourceKind === 'official_form' || value.includes('官网') || value.includes('official')) return 'official';
  return 'other';
}

function isJobSpecificUrl(raw: string): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    const value = `${url.pathname}${url.search}${url.hash}`.toLowerCase();
    return /position|job[-_]?detail|\/job\/|\/jobs\/|vacancy|positionid|jobid|\/apply|\/openings\//.test(value);
  } catch {
    return false;
  }
}

function listingFromSource(source: LegacyLedgerSource): JobListingCandidate {
  let url: string | null = null;
  if (source.url) {
    try { url = new URL(source.url).toString(); } catch { url = null; }
  }
  const sourceKind = mapSourceKind(source);
  const raw = safeJson(source.rawJson);
  const metadataSnapshot: Record<string, unknown> = {
    importedFrom: 'job-application-copilot-central-ledger',
    legacySourceId: source.id,
    legacySourceKind: source.sourceKind,
    firstSeenAt: source.firstSeenAt,
    lastSeenAt: source.lastSeenAt,
  };
  if (source.contactEmail) metadataSnapshot.contactEmail = source.contactEmail;
  if (raw != null) metadataSnapshot.legacyRaw = raw;
  if (source.externalJobId) {
    return {
      sourceKind, label: source.source || null, url,
      externalNamespace: source.source || sourceKind,
      externalId: source.externalJobId,
      identityKind: 'external-id', status: 'active', metadataSnapshot,
    };
  }
  return {
    sourceKind, label: source.source || null, url,
    identityKind: url && isJobSpecificUrl(url) ? 'url' : 'scoped',
    status: 'active', metadataSnapshot,
  };
}

function legacyDescription(job: LegacyLedgerJob): string | null {
  const parts = [
    job.graduation ? `Graduation: ${job.graduation}` : null,
    job.experience ? `Experience: ${job.experience}` : null,
    job.aiHighlights ? `Signals: ${job.aiHighlights}` : null,
    job.notes ? `Legacy note: ${job.notes}` : null,
  ].filter((value): value is string => Boolean(value));
  return parts.length ? parts.join('\n') : null;
}

function targetState(status: string): JobState {
  if (status === 'shortlisted' || status === 'applied') return 'shortlisted';
  if (status === 'closed') return 'closed';
  if (status === 'skipped' || status === 'rejected') return 'ignored';
  return 'discovered';
}

function relaxed(value: string): string {
  return normalizeIdentityText(value).replace(/[\s/\\()（）【】\[\]·,，.。:：;；_\-]/g, '');
}

function companiesCompatible(left: string, right: string): boolean {
  const a = relaxed(left);
  const b = relaxed(right);
  if (!a || !b) return false;
  return a === b || (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)));
}

function urls(job: Job): Set<string> {
  return new Set(job.listings.flatMap((listing) => {
    if (!listing.url) return [];
    try { return [normalizeCanonicalUrl(listing.url)]; } catch { return []; }
  }));
}

function sharesUrl(candidate: UpsertJobCandidate, job: Job): boolean {
  const existing = urls(job);
  return candidate.listings.some((listing) => {
    if (!listing.url) return false;
    try { return existing.has(normalizeCanonicalUrl(listing.url)); } catch { return false; }
  });
}

function anchorListing(job: Job): JobListing | null {
  return job.listings.find((listing) => listing.identityKind === 'external-id')
    ?? job.listings.find((listing) => listing.identityKind === 'url')
    ?? null;
}

function anchorCandidate(listing: JobListing): JobListingCandidate {
  return {
    sourceKind: listing.sourceKind,
    label: listing.label,
    url: listing.url,
    externalNamespace: listing.externalNamespace,
    externalId: listing.externalId,
    identityKind: listing.identityKind,
    status: listing.status,
    publishedAt: listing.publishedAt,
    metadataSnapshot: listing.metadataSnapshot,
  };
}

async function adoptionAnchor(career: CareerRuntimePorts, job: LegacyLedgerJob, candidate: UpsertJobCandidate): Promise<JobListing | null> {
  const duplicate = await career.jobs.checkDuplicate({ companyName: job.company, title: job.title, city: job.city || null, listings: candidate.listings });
  if (duplicate.duplicate) return null;

  const candidates = duplicate.potentialMatches.length
    ? duplicate.potentialMatches
    : (await career.jobs.searchJobs({ title: job.title, ...(job.city ? { city: job.city } : {}), limit: 50, offset: 0 })).items;
  const compatible = candidates.filter((existing) =>
    relaxed(existing.title) === relaxed(job.title)
    && relaxed(existing.city ?? '') === relaxed(job.city)
    && companiesCompatible(existing.companyName, job.company)
    && sharesUrl(candidate, existing),
  );
  if (compatible.length !== 1) return null;
  return anchorListing(compatible[0]!);
}

function candidateFor(
  job: LegacyLedgerJob,
  sources: readonly LegacyLedgerSource[],
  observedAt: string,
  discoveryRunId: string,
  includeDescription: boolean,
  anchor?: JobListing | null,
): UpsertJobCandidate {
  const listings = sources.map(listingFromSource);
  if (anchor) listings.unshift(anchorCandidate(anchor));
  if (listings.length === 0) {
    listings.push({
      sourceKind: 'manual', label: 'legacy-ledger-import', url: null, identityKind: 'scoped', status: 'unknown',
      metadataSnapshot: { importedFrom: 'job-application-copilot-central-ledger', legacyJobId: job.id, syntheticFallback: true },
    });
  }
  return {
    companyName: job.company,
    title: job.title,
    city: job.city || null,
    listings,
    description: includeDescription ? legacyDescription(job) : null,
    observedAt,
    discoveryRunId,
  };
}

async function setLegacyState(career: CareerRuntimePorts, jobId: string, legacy: LegacyLedgerJob, fingerprint: string): Promise<boolean> {
  const target = targetState(legacy.status);
  const current = await career.jobs.getJob(jobId);
  if (!current || current.state === target) return false;
  // Never downgrade richer current truth. The legacy source is useful mainly for
  // discovered -> shortlisted/terminal promotion.
  if (current.state !== 'discovered') return false;
  try {
    await career.jobs.setJobState({
      jobId,
      state: target,
      idempotencyKey: `legacy-ledger-state:${fingerprint.slice(0, 24)}:${legacy.id}:${target}`,
    });
    return true;
  } catch {
    return false;
  }
}

export async function importLegacyCentralJobLedger(
  dataset: LegacyCentralLedgerDataset,
  career: CareerRuntimePorts,
  options: LegacyCentralLedgerImportOptions,
): Promise<LegacyCentralLedgerImportReport> {
  const sourceLabel = options.sourceLabel ?? 'job-application-copilot-central-ledger';
  if (options.campaignId && !(await career.campaigns.getCampaign(options.campaignId))) {
    throw new Error(`Campaign '${options.campaignId}' does not exist`);
  }
  const jobById = new Map(dataset.jobs.map((job) => [job.id, job]));
  const sourcesByJob = new Map<number, LegacyLedgerSource[]>();
  for (const source of dataset.sources) {
    const list = sourcesByJob.get(source.jobId) ?? [];
    list.push(source);
    sourcesByJob.set(source.jobId, list);
  }
  const eventsByRun = new Map<string, LegacyLedgerEvent[]>();
  for (const event of dataset.events) {
    if (!event.runId) continue;
    const list = eventsByRun.get(event.runId) ?? [];
    list.push(event);
    eventsByRun.set(event.runId, list);
  }

  let runsImported = 0;
  let runsAlreadyImported = 0;
  let jobsInserted = 0;
  let jobsUpdated = 0;
  let jobsDuplicate = 0;
  let jobsRejected = 0;
  let jobsAdoptedByLegacyEvidence = 0;
  let stateUpdates = 0;
  const resolvedJobIds = new Map<number, string>();

  for (const legacyRun of dataset.runs) {
    const events = eventsByRun.get(legacyRun.runId) ?? [];
    const run = await career.discovery.beginDiscoveryRun({
      ...(options.campaignId ? { campaignId: options.campaignId } : {}),
      executor: 'import',
      contextSnapshot: {
        source: sourceLabel,
        fingerprint: dataset.fingerprint,
        importedAt: options.importedAt,
        legacyRunId: legacyRun.runId,
        legacyRanAt: legacyRun.ranAt,
        legacyScope: legacyRun.scope,
        legacySource: legacyRun.source,
        legacyResultCount: legacyRun.resultCount,
        legacyNewCount: legacyRun.newCount,
        legacyMetadata: safeJson(legacyRun.metadataJson),
      },
      startedAt: legacyRun.ranAt,
      idempotencyKey: `legacy-ledger:${dataset.fingerprint.slice(0, 24)}:${legacyRun.runId}`,
    });
    if (run.completedAt) {
      runsAlreadyImported += 1;
      continue;
    }
    runsImported += 1;
    let inserted = 0;
    let updated = 0;
    let duplicate = 0;
    let rejected = 0;
    for (const event of events) {
      const legacyJob = jobById.get(event.jobId);
      if (!legacyJob) { rejected += 1; jobsRejected += 1; continue; }
      const sources = sourcesByJob.get(legacyJob.id) ?? [];
      let candidate = candidateFor(legacyJob, sources, event.seenAt, run.id, true);
      const initialDuplicate = await career.jobs.checkDuplicate({
        companyName: candidate.companyName, title: candidate.title, city: candidate.city, listings: candidate.listings,
      });
      if (initialDuplicate.duplicate) {
        candidate = { ...candidate, description: null };
      } else {
        const anchor = await adoptionAnchor(career, legacyJob, candidate);
        if (anchor) {
          candidate = candidateFor(legacyJob, sources, event.seenAt, run.id, false, anchor);
          jobsAdoptedByLegacyEvidence += 1;
        }
      }
      const result = (await career.jobs.upsertJobsBatch({ jobs: [candidate] })).items[0]!;
      if (result.status === 'inserted') { inserted += 1; jobsInserted += 1; }
      else if (result.status === 'updated') { updated += 1; jobsUpdated += 1; }
      else if (result.status === 'duplicate') { duplicate += 1; jobsDuplicate += 1; }
      else { rejected += 1; jobsRejected += 1; }
      if (result.jobId) resolvedJobIds.set(legacyJob.id, result.jobId);
    }
    await career.discovery.completeDiscoveryRun({
      runId: run.id,
      completedAt: legacyRun.ranAt,
      candidateCount: events.length,
      insertedCount: inserted,
      duplicateCount: duplicate + updated,
      rejectedCount: rejected,
    });
  }

  for (const legacyJob of dataset.jobs) {
    const jobId = resolvedJobIds.get(legacyJob.id);
    if (jobId && await setLegacyState(career, jobId, legacyJob, dataset.fingerprint)) stateUpdates += 1;
  }

  const applicationEvidence: Array<LegacyCentralLedgerImportReport['applicationEvidence'][number]> = [];
  let applicationEvidenceCovered = 0;
  let applicationEvidenceUnresolved = 0;
  for (const legacy of dataset.applications) {
    const matches = await career.applications.listApplications({ company: legacy.company, limit: 200, offset: 0, terminal: 'include' });
    const matchingApplicationIds = matches.items.map((item) => item.application.id);
    if (matchingApplicationIds.length) {
      applicationEvidenceCovered += 1;
      applicationEvidence.push({
        legacyApplicationId: legacy.id,
        company: legacy.company,
        status: 'covered-by-existing-application',
        matchingApplicationIds,
      });
    } else {
      applicationEvidenceUnresolved += 1;
      applicationEvidence.push({ legacyApplicationId: legacy.id, company: legacy.company, status: 'unresolved', matchingApplicationIds: [] });
    }
  }

  return {
    fingerprint: dataset.fingerprint,
    sourceJobs: dataset.jobs.length,
    sourceRuns: dataset.runs.length,
    sourceEvents: dataset.events.length,
    sourceApplications: dataset.applications.length,
    sourceCompanyLocks: dataset.companyLocks.length,
    runsImported,
    runsAlreadyImported,
    jobsInserted,
    jobsUpdated,
    jobsDuplicate,
    jobsRejected,
    jobsAdoptedByLegacyEvidence,
    stateUpdates,
    applicationEvidenceCovered,
    applicationEvidenceUnresolved,
    applicationEvidence,
  };
}
