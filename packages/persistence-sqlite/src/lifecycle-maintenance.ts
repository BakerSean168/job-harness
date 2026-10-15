import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { assessOpportunityAvailability, type ListingLifecycleEvidence } from '@job-harness/domain';
import { migrateSqliteDatabase } from './schema';

const REQUIRED_LIFECYCLE_SCHEMA_VERSION = 19;

type DbRow = Record<string, unknown>;

export interface CampaignLifecycleSweepInput {
  databasePath: string;
  campaignId: string;
  asOf: string;
  /** Defaults to preview-only. Only explicit apply=true performs scoped mutations. */
  apply?: boolean;
  limit?: number;
  graceHours?: number;
}

export interface CampaignLifecycleSweepReport {
  campaignId: string;
  asOf: string;
  dryRun: boolean;
  examined: number;
  wouldArchive: number;
  archived: number;
  restored: number;
  skippedApplication: number;
  skippedPendingSubmission: number;
  retainedUnverified: number;
  candidates: Array<{ jobId: string; action: 'archive' | 'restore'; reason: string }>;
}

/**
 * A campaign-scoped *projection* change, never a change to the global Job triage
 * state or Application stage. Unverified disappearance cannot trigger archival.
 */
export function runCampaignLifecycleSweep(input: CampaignLifecycleSweepInput): CampaignLifecycleSweepReport {
  if (!input.campaignId.trim()) throw new Error('campaignId is required');
  if (!Number.isFinite(Date.parse(input.asOf))) throw new Error('asOf must be an ISO timestamp');
  const limit = input.limit ?? 20000;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50000) throw new Error('limit must be 1..50000');
  const graceHours = input.graceHours ?? 48;
  if (!Number.isInteger(graceHours) || graceHours < 24 || graceHours > 720) throw new Error('graceHours must be 24..720');
  if (!existsSync(input.databasePath)) throw new Error('Lifecycle database does not exist: ' + input.databasePath);
  const db = new DatabaseSync(input.databasePath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  try {
    if (input.apply) {
      // Schema migration is a separate explicit write boundary. A preview must
      // never silently rewrite even an older SQLite database.
      migrateSqliteDatabase(db);
    } else {
      const version = Number((db.prepare('PRAGMA user_version').get() as { user_version?: number }).user_version ?? 0);
      if (version < REQUIRED_LIFECYCLE_SCHEMA_VERSION) {
        throw new Error(`Lifecycle preview requires SQLite schema ${REQUIRED_LIFECYCLE_SCHEMA_VERSION}; found ${version}. Upgrade explicitly first.`);
      }
    }
    const campaign = db.prepare('SELECT id,status FROM campaigns WHERE id=?').get(input.campaignId) as DbRow | undefined;
    if (!campaign) throw new Error('Unknown campaign: ' + input.campaignId);
    if (campaign.status !== 'active') throw new Error('Cannot sweep a non-active campaign: ' + input.campaignId);
    const report: CampaignLifecycleSweepReport = {
      campaignId: input.campaignId,
      asOf: input.asOf,
      dryRun: input.apply !== true,
      examined: 0,
      wouldArchive: 0,
      archived: 0,
      restored: 0,
      skippedApplication: 0,
      skippedPendingSubmission: 0,
      retainedUnverified: 0,
      candidates: [],
    };
    const candidates = db.prepare(
      'SELECT DISTINCT j.id AS job_id, j.state AS triage_state, ' +
      "COALESCE(s.status,'active') AS scoped_status, s.archived_at AS scoped_archived_at " +
      'FROM jobs j ' +
      'JOIN job_observations o ON o.job_id=j.id ' +
      'JOIN discovery_runs d ON d.id=o.discovery_run_id ' +
      'LEFT JOIN campaign_job_states s ON s.campaign_id=d.campaign_id AND s.job_id=j.id ' +
      'WHERE d.campaign_id=? AND j.state IN (' +
      "'discovered','shortlisted','closed','archived'" +
      ') ORDER BY j.last_seen_at ASC,j.id LIMIT ?'
    ).all(input.campaignId, limit) as DbRow[];
    if (input.apply) db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of candidates) {
        report.examined += 1;
        const jobId = String(row.job_id);
        const current = String(row.scoped_status);
        const listingRows = db.prepare(
          'SELECT status, application_deadline_json, last_verified_at, last_verified_open_at ' +
          'FROM job_listings WHERE job_id=?'
        ).all(jobId) as DbRow[];
        const listings: ListingLifecycleEvidence[] = listingRows.map((listing) => ({
          status: String(listing.status) as ListingLifecycleEvidence['status'],
          applicationDeadline: listing.application_deadline_json == null
            ? null : JSON.parse(String(listing.application_deadline_json)) as NonNullable<ListingLifecycleEvidence['applicationDeadline']>,
          lastVerifiedAt: listing.last_verified_at == null ? null : String(listing.last_verified_at),
          lastVerifiedOpenAt: listing.last_verified_open_at == null ? null : String(listing.last_verified_open_at),
        }));
        const assessment = assessOpportunityAvailability(listings, input.asOf, graceHours);
        // An actual fresh confirmation can revive a scoped archive, never a search hit alone.
        if (current === 'archived') {
          const archivedAt = row.scoped_archived_at == null ? null : String(row.scoped_archived_at);
          const verifiedAfterArchive = archivedAt && listingRows.some((listing) =>
            listing.last_verified_open_at != null && Date.parse(String(listing.last_verified_open_at)) > Date.parse(archivedAt));
          if (assessment.applyability === 'confirmed_open' && verifiedAfterArchive) {
            report.candidates.push({ jobId, action: 'restore', reason: 'verified_reopen' });
            if (input.apply) {
              changeScopeState(db, input.campaignId, jobId, 'archived', 'active', 'verified_reopen', input.asOf);
              report.restored += 1;
            }
          }
          continue;
        }
        if (!assessment.archiveEligible) {
          report.retainedUnverified += 1;
          continue;
        }
        const application = db.prepare('SELECT 1 FROM applications WHERE job_id=? LIMIT 1').get(jobId);
        if (application) { report.skippedApplication += 1; continue; }
        const pending = db.prepare(
          "SELECT 1 FROM submission_intents WHERE job_id=? AND status NOT IN ('committed','external_failed') LIMIT 1"
        ).get(jobId);
        if (pending) { report.skippedPendingSubmission += 1; continue; }
        report.wouldArchive += 1;
        const reason = assessment.archiveReason ?? 'unknown';
        report.candidates.push({ jobId, action: 'archive', reason });
        if (input.apply) {
          changeScopeState(db, input.campaignId, jobId, current, 'archived', reason, input.asOf);
          report.archived += 1;
        }
      }
      if (input.apply) db.exec('COMMIT');
    } catch (error) {
      if (input.apply) db.exec('ROLLBACK');
      throw error;
    }
    report.candidates = report.candidates.slice(0, 50);
    return report;
  } finally {
    db.close();
  }
}

function changeScopeState(
  db: DatabaseSync,
  campaignId: string,
  jobId: string,
  from: string,
  to: 'active' | 'archived',
  reason: string,
  at: string,
): void {
  db.prepare(
    'INSERT INTO campaign_job_states (campaign_id,job_id,status,archived_at,archive_reason,updated_at) ' +
    'VALUES (?,?,?,?,?,?) ON CONFLICT (campaign_id,job_id) DO UPDATE SET ' +
    'status=excluded.status,archived_at=excluded.archived_at,archive_reason=excluded.archive_reason,updated_at=excluded.updated_at'
  ).run(campaignId, jobId, to, to === 'archived' ? at : null, to === 'archived' ? reason : null, at);
  db.prepare(
    'INSERT INTO campaign_job_state_events (id,campaign_id,job_id,from_status,to_status,reason,actor,occurred_at) ' +
    'VALUES (?,?,?,?,?,?,?,?)'
  ).run(randomUUID(), campaignId, jobId, from, to, reason, 'system', at);
}
