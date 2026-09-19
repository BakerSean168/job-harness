import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
export const DEFAULT_JOB_LEDGER_PATH = path.join(root, '.local', 'job-ledger', 'jobs.sqlite3');

const HIGH_COMPETITION_PATTERNS = [
  '拼多多', 'pdd', '字节跳动', 'bytedance', '腾讯', 'tencent', '阿里巴巴', 'alibaba',
  '蚂蚁集团', 'antgroup', '百度', 'baidu', '美团', 'meituan', '快手', 'kuaishou',
  '京东', 'jd.com', '华为', 'huawei', '小米', 'xiaomi', '网易', 'netease'
];

export function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, '')
    .replace(/[·•・,，.。()（）\[\]【】{}<>《》'"“”‘’_\-—–/\\|:：;；]/g, '');
}

export function normalizeCompanyName(value = '') {
  return normalizeText(value)
    .replace(/股份有限公司$/u, '')
    .replace(/有限责任公司$/u, '')
    .replace(/有限公司$/u, '')
    .replace(/集团$/u, '');
}

export function normalizeJobTitle(value = '') {
  return normalizeText(value)
    .replace(/[（(](?:校招|应届|26届|2026届|2026校招)[）)]/gu, '')
    .replace(/(?:校招|应届|26届|2026届|2026校招)$/gu, '');
}

export function normalizeCity(value = '') {
  return normalizeText(value).replace(/市$/u, '');
}

export function normalizeUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|from$|source$|channel$|ref$|spm$|track)/i.test(key)) url.searchParams.delete(key);
    }
    const search = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    url.search = '';
    for (const [key, val] of search) url.searchParams.append(key, val);
    return url.toString().replace(/\/$/, '');
  } catch {
    return raw.replace(/\/$/, '');
  }
}

export function inferCompetitionTier(companyName = '') {
  const normalized = normalizeCompanyName(companyName);
  return HIGH_COMPETITION_PATTERNS.some((pattern) => normalized.includes(normalizeCompanyName(pattern)))
    ? 'high'
    : 'normal';
}

export function openJobLedger(databasePath = DEFAULT_JOB_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  initSchema(db);
  return db;
}

export function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY,
      canonical_name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      primary_city TEXT NOT NULL DEFAULT '',
      website TEXT NOT NULL DEFAULT '',
      competition_tier TEXT NOT NULL DEFAULT 'normal' CHECK (competition_tier IN ('normal','high','low')),
      collection_weight INTEGER NOT NULL DEFAULT 100,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS company_aliases (
      alias_normalized TEXT PRIMARY KEY,
      alias_display TEXT NOT NULL,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      normalized_city TEXT NOT NULL DEFAULT '',
      graduation TEXT NOT NULL DEFAULT '',
      experience TEXT NOT NULL DEFAULT '',
      ai_highlights TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'discovered' CHECK (status IN ('discovered','shortlisted','applied','skipped','rejected','closed')),
      suppressed_from_primary INTEGER NOT NULL DEFAULT 0 CHECK (suppressed_from_primary IN (0,1)),
      notes TEXT NOT NULL DEFAULT '',
      first_discovered_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      UNIQUE(company_id, normalized_title, normalized_city)
    );

    CREATE TABLE IF NOT EXISTS job_sources (
      id INTEGER PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT '',
      source_kind TEXT NOT NULL DEFAULT 'platform_discovery',
      url TEXT NOT NULL DEFAULT '',
      normalized_url TEXT,
      external_job_id TEXT,
      contact_email TEXT NOT NULL DEFAULT '',
      raw_json TEXT NOT NULL DEFAULT '',
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    DROP INDEX IF EXISTS idx_job_sources_url;
    DROP INDEX IF EXISTS idx_job_sources_external;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_job_sources_job_url
      ON job_sources(job_id, normalized_url) WHERE normalized_url IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_job_sources_job_external
      ON job_sources(job_id, source, external_job_id) WHERE external_job_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS discovery_runs (
      run_id TEXT PRIMARY KEY,
      ran_at TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      result_count INTEGER NOT NULL DEFAULT 0,
      new_count INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS discovery_events (
      id INTEGER PRIMARY KEY,
      run_id TEXT REFERENCES discovery_runs(run_id) ON DELETE SET NULL,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      seen_at TEXT NOT NULL,
      is_new INTEGER NOT NULL DEFAULT 0 CHECK (is_new IN (0,1)),
      source TEXT NOT NULL DEFAULT '',
      query TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_discovery_events_job ON discovery_events(job_id, seen_at DESC);

    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY,
      job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'applied',
      applied_at TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT '',
      profile_id TEXT NOT NULL DEFAULT '',
      resume_name TEXT NOT NULL DEFAULT '',
      external_ref TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_job_applied
      ON applications(job_id) WHERE job_id IS NOT NULL AND status = 'applied';

    CREATE TABLE IF NOT EXISTS company_application_locks (
      company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      locked_at TEXT NOT NULL,
      expires_at TEXT,
      notes TEXT NOT NULL DEFAULT ''
    );
  `);
}

function nowIso(value) {
  return value ? new Date(value).toISOString() : new Date().toISOString();
}

function clean(value, max = 5000) {
  return String(value ?? '').trim().slice(0, max);
}

function resolveCompanyByAlias(db, name) {
  const normalized = normalizeCompanyName(name);
  if (!normalized) return null;
  return db.prepare(`
    SELECT c.* FROM company_aliases a
    JOIN companies c ON c.id = a.company_id
    WHERE a.alias_normalized = ?
  `).get(normalized) || db.prepare('SELECT * FROM companies WHERE normalized_name = ?').get(normalized) || null;
}

export function upsertCompany(db, input = {}) {
  const name = clean(input.name || input.company, 240);
  if (!name) throw new Error('company name is required');
  const normalized = normalizeCompanyName(name);
  const existing = resolveCompanyByAlias(db, name);
  const time = nowIso(input.updatedAt || input.seenAt || input.discoveredAt);
  const inferredTier = input.competitionTier || inferCompetitionTier(name);
  const weight = Number.isFinite(Number(input.collectionWeight))
    ? Math.max(0, Math.min(200, Math.round(Number(input.collectionWeight))))
    : (inferredTier === 'high' ? 15 : 100);

  if (existing) {
    db.prepare(`
      UPDATE companies SET
        primary_city = CASE WHEN ? <> '' THEN ? ELSE primary_city END,
        website = CASE WHEN ? <> '' THEN ? ELSE website END,
        competition_tier = CASE
          WHEN competition_tier = 'high' THEN 'high'
          WHEN ? = 'high' THEN 'high'
          ELSE competition_tier
        END,
        collection_weight = CASE WHEN ? < collection_weight THEN ? ELSE collection_weight END,
        notes = CASE WHEN ? <> '' THEN ? ELSE notes END,
        updated_at = ?
      WHERE id = ?
    `).run(
      clean(input.city, 120), clean(input.city, 120),
      clean(input.website, 1000), clean(input.website, 1000),
      inferredTier, weight, weight,
      clean(input.notes, 3000), clean(input.notes, 3000),
      time, existing.id
    );
    return db.prepare('SELECT * FROM companies WHERE id = ?').get(existing.id);
  }

  const result = db.prepare(`
    INSERT INTO companies (
      canonical_name, normalized_name, primary_city, website, competition_tier,
      collection_weight, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name, normalized, clean(input.city, 120), clean(input.website, 1000), inferredTier,
    weight, clean(input.notes, 3000), time, time
  );
  return db.prepare('SELECT * FROM companies WHERE id = ?').get(Number(result.lastInsertRowid));
}

export function addCompanyAlias(db, companyName, alias) {
  const company = upsertCompany(db, { name: companyName });
  const aliasDisplay = clean(alias, 240);
  const normalized = normalizeCompanyName(aliasDisplay);
  if (!normalized) throw new Error('alias is required');
  db.prepare(`
    INSERT INTO company_aliases(alias_normalized, alias_display, company_id)
    VALUES (?, ?, ?)
    ON CONFLICT(alias_normalized) DO UPDATE SET company_id = excluded.company_id, alias_display = excluded.alias_display
  `).run(normalized, aliasDisplay, company.id);
  return company;
}

function findJobByExternalId(db, input = {}) {
  if (!input.source || !input.externalJobId) return null;
  return db.prepare(`
    SELECT j.* FROM job_sources s JOIN jobs j ON j.id = s.job_id
    WHERE s.source = ? AND s.external_job_id = ?
  `).get(clean(input.source, 120), clean(input.externalJobId, 240)) || null;
}

export function findCanonicalJob(db, input = {}) {
  const company = resolveCompanyByAlias(db, input.company || input.companyName || '');
  if (company && input.title) {
    const semantic = db.prepare(`
      SELECT * FROM jobs WHERE company_id = ? AND normalized_title = ? AND normalized_city = ?
    `).get(company.id, normalizeJobTitle(input.title), normalizeCity(input.city)) || null;
    if (semantic) return semantic;
  }
  return findJobByExternalId(db, input);
}

function upsertJobSource(db, jobId, input, time) {
  const normalizedUrl = normalizeUrl(input.url);
  const source = clean(input.source, 120);
  const externalJobId = clean(input.externalJobId, 240) || null;
  let existing = null;
  if (normalizedUrl) existing = db.prepare('SELECT * FROM job_sources WHERE job_id = ? AND normalized_url = ?').get(jobId, normalizedUrl) || null;
  if (!existing && source && externalJobId) {
    existing = db.prepare('SELECT * FROM job_sources WHERE job_id = ? AND source = ? AND external_job_id = ?').get(jobId, source, externalJobId) || null;
  }
  if (existing) {
    db.prepare(`
      UPDATE job_sources SET job_id = ?, last_seen_at = ?, contact_email = CASE WHEN ? <> '' THEN ? ELSE contact_email END,
        raw_json = CASE WHEN ? <> '' THEN ? ELSE raw_json END
      WHERE id = ?
    `).run(jobId, time, clean(input.contactEmail, 320), clean(input.contactEmail, 320), clean(input.rawJson, 20000), clean(input.rawJson, 20000), existing.id);
    return existing.id;
  }
  const result = db.prepare(`
    INSERT INTO job_sources(job_id, source, source_kind, url, normalized_url, external_job_id, contact_email, raw_json, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    jobId, source, clean(input.sourceKind || 'platform_discovery', 80), clean(input.url, 1600), normalizedUrl,
    externalJobId, clean(input.contactEmail, 320), clean(input.rawJson, 20000), time, time
  );
  return Number(result.lastInsertRowid);
}

export function upsertJob(db, input = {}) {
  const companyName = clean(input.company || input.companyName, 240);
  const title = clean(input.title, 320);
  if (!companyName || !title) throw new Error('company and title are required');
  const time = nowIso(input.discoveredAt || input.seenAt);
  const company = upsertCompany(db, {
    name: companyName,
    city: input.city,
    website: input.companyWebsite,
    competitionTier: input.competitionTier,
    collectionWeight: input.collectionWeight,
  });
  const normalizedTitle = normalizeJobTitle(title);
  const normalizedCity = normalizeCity(input.city);
  let job = db.prepare(`
    SELECT * FROM jobs WHERE company_id = ? AND normalized_title = ? AND normalized_city = ?
  `).get(company.id, normalizedTitle, normalizedCity) || findJobByExternalId(db, input) || null;
  const isNew = !job;
  const suppressed = input.suppressedFromPrimary != null
    ? Number(Boolean(input.suppressedFromPrimary))
    : Number(company.competition_tier === 'high');

  if (!job) {
    const result = db.prepare(`
      INSERT INTO jobs(
        company_id, title, normalized_title, city, normalized_city, graduation, experience,
        ai_highlights, status, suppressed_from_primary, notes, first_discovered_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      company.id, title, normalizedTitle, clean(input.city, 120), normalizedCity,
      clean(input.graduation, 500), clean(input.experience, 500), clean(input.aiHighlights, 5000),
      clean(input.status || 'discovered', 40), suppressed, clean(input.notes, 3000), time, time
    );
    job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(Number(result.lastInsertRowid));
  } else {
    db.prepare(`
      UPDATE jobs SET
        last_seen_at = ?,
        graduation = CASE WHEN ? <> '' THEN ? ELSE graduation END,
        experience = CASE WHEN ? <> '' THEN ? ELSE experience END,
        ai_highlights = CASE WHEN ? <> '' THEN ? ELSE ai_highlights END,
        notes = CASE WHEN ? <> '' THEN ? ELSE notes END,
        suppressed_from_primary = CASE WHEN suppressed_from_primary = 1 OR ? = 1 THEN 1 ELSE 0 END
      WHERE id = ?
    `).run(
      time,
      clean(input.graduation, 500), clean(input.graduation, 500),
      clean(input.experience, 500), clean(input.experience, 500),
      clean(input.aiHighlights, 5000), clean(input.aiHighlights, 5000),
      clean(input.notes, 3000), clean(input.notes, 3000),
      suppressed, job.id
    );
    job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id);
  }

  const sourceId = upsertJobSource(db, job.id, input, time);
  if (input.runId) {
    db.prepare(`
      INSERT OR IGNORE INTO discovery_runs(run_id, ran_at, scope, source, result_count, new_count, metadata_json)
      VALUES (?, ?, ?, ?, 0, 0, '')
    `).run(clean(input.runId, 240), time, clean(input.runScope, 500), clean(input.source, 120));
    db.prepare(`
      INSERT INTO discovery_events(run_id, job_id, seen_at, is_new, source, query)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(clean(input.runId, 240), job.id, time, Number(isNew), clean(input.source, 120), clean(input.query, 1000));
    db.prepare(`
      UPDATE discovery_runs SET result_count = result_count + 1, new_count = new_count + ?, ran_at = ? WHERE run_id = ?
    `).run(Number(isNew), time, clean(input.runId, 240));
  }
  return { job, company, sourceId, isNew, duplicate: !isNew };
}

export function recordApplication(db, input = {}) {
  const companyName = clean(input.company || input.companyName, 240);
  if (!companyName) throw new Error('company is required');
  const company = upsertCompany(db, { name: companyName, city: input.city });
  let job = null;
  if (input.title) {
    const upserted = upsertJob(db, { ...input, company: company.canonical_name, status: 'applied', source: input.platform || input.source || '' });
    job = upserted.job;
    db.prepare(`UPDATE jobs SET status = 'applied' WHERE id = ?`).run(job.id);
  }
  const appliedAt = nowIso(input.appliedAt);
  if (job) {
    const existing = db.prepare(`SELECT * FROM applications WHERE job_id = ? AND status = 'applied'`).get(job.id);
    if (existing) return { recorded: false, duplicate: true, application: existing, job, company };
  }
  const result = db.prepare(`
    INSERT INTO applications(job_id, company_id, status, applied_at, platform, profile_id, resume_name, external_ref, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    job?.id ?? null, company.id, clean(input.status || 'applied', 40), appliedAt,
    clean(input.platform || input.source, 120), clean(input.profileId, 120), clean(input.resumeName || input.resumePdfName, 320),
    clean(input.externalRef || input.url, 1600), clean(input.notes, 3000), new Date().toISOString()
  );
  return { recorded: true, duplicate: false, application: db.prepare('SELECT * FROM applications WHERE id = ?').get(Number(result.lastInsertRowid)), job, company };
}

export function lockCompanyApplications(db, input = {}) {
  const company = upsertCompany(db, { name: input.company || input.companyName });
  const lockedAt = nowIso(input.lockedAt);
  const expiresAt = input.expiresAt ? nowIso(input.expiresAt) : null;
  db.prepare(`
    INSERT INTO company_application_locks(company_id, reason, locked_at, expires_at, notes)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(company_id) DO UPDATE SET reason = excluded.reason, locked_at = excluded.locked_at,
      expires_at = excluded.expires_at, notes = excluded.notes
  `).run(company.id, clean(input.reason || 'already_applied', 500), lockedAt, expiresAt, clean(input.notes, 3000));
  return db.prepare(`SELECT l.*, c.canonical_name FROM company_application_locks l JOIN companies c ON c.id = l.company_id WHERE company_id = ?`).get(company.id);
}

export function checkDuplicate(db, input = {}) {
  const job = findCanonicalJob(db, input);
  const company = resolveCompanyByAlias(db, input.company || input.companyName || '');
  const application = job ? db.prepare(`SELECT * FROM applications WHERE job_id = ? AND status = 'applied'`).get(job.id) || null : null;
  const companyLock = company ? db.prepare(`SELECT * FROM company_application_locks WHERE company_id = ?`).get(company.id) || null : null;
  return {
    knownJob: Boolean(job),
    job: job || null,
    alreadyApplied: Boolean(application),
    application,
    companyLocked: Boolean(companyLock),
    companyLock,
    suppressFromPrimary: Boolean(job?.suppressed_from_primary || company?.competition_tier === 'high'),
  };
}

export function getLedgerStats(db) {
  const scalar = (sql) => Number(db.prepare(sql).get()?.n || 0);
  return {
    companies: scalar('SELECT COUNT(*) AS n FROM companies'),
    jobs: scalar('SELECT COUNT(*) AS n FROM jobs'),
    sources: scalar('SELECT COUNT(*) AS n FROM job_sources'),
    applications: scalar("SELECT COUNT(*) AS n FROM applications WHERE status = 'applied'"),
    companyLocks: scalar('SELECT COUNT(*) AS n FROM company_application_locks'),
    primaryQueue: scalar(`
      SELECT COUNT(*) AS n FROM jobs j
      JOIN companies c ON c.id = j.company_id
      LEFT JOIN company_application_locks l ON l.company_id = c.id
      LEFT JOIN applications a ON a.job_id = j.id AND a.status = 'applied'
      WHERE j.status IN ('discovered','shortlisted') AND j.suppressed_from_primary = 0
        AND c.competition_tier <> 'high' AND l.company_id IS NULL AND a.id IS NULL
    `),
  };
}

export function listPrimaryQueue(db, limit = 100) {
  const n = Math.max(1, Math.min(500, Number(limit || 100)));
  return db.prepare(`
    SELECT j.id, c.canonical_name AS company, j.title, j.city, j.graduation, j.experience,
      j.ai_highlights AS aiHighlights, j.first_discovered_at AS discoveredAt, j.last_seen_at AS lastSeenAt,
      c.competition_tier AS competitionTier, c.collection_weight AS collectionWeight,
      (SELECT s.url FROM job_sources s WHERE s.job_id = j.id ORDER BY CASE s.source_kind WHEN 'official_form' THEN 0 WHEN 'email' THEN 1 ELSE 2 END, s.last_seen_at DESC LIMIT 1) AS url,
      (SELECT s.source FROM job_sources s WHERE s.job_id = j.id ORDER BY s.last_seen_at DESC LIMIT 1) AS source,
      (SELECT s.contact_email FROM job_sources s WHERE s.job_id = j.id AND s.contact_email <> '' ORDER BY s.last_seen_at DESC LIMIT 1) AS contactEmail
    FROM jobs j
    JOIN companies c ON c.id = j.company_id
    LEFT JOIN company_application_locks l ON l.company_id = c.id
    LEFT JOIN applications a ON a.job_id = j.id AND a.status = 'applied'
    WHERE j.status IN ('discovered','shortlisted') AND j.suppressed_from_primary = 0
      AND c.competition_tier <> 'high' AND l.company_id IS NULL AND a.id IS NULL
    ORDER BY c.collection_weight DESC,
      CASE j.city WHEN '杭州' THEN 0 WHEN '深圳' THEN 1 WHEN '上海' THEN 2 WHEN '广州' THEN 3 WHEN '北京' THEN 4 ELSE 5 END,
      j.last_seen_at DESC
    LIMIT ?
  `).all(n);
}

export function listJobs(db, options = {}) {
  const includeSuppressed = Boolean(options.includeSuppressed);
  const limit = Math.max(1, Math.min(1000, Number(options.limit || 200)));
  const where = includeSuppressed ? '' : 'WHERE j.suppressed_from_primary = 0';
  return db.prepare(`
    SELECT j.id, c.canonical_name AS company, j.title, j.city, j.status, c.competition_tier AS competitionTier,
      j.suppressed_from_primary AS suppressedFromPrimary, j.first_discovered_at AS firstDiscoveredAt,
      j.last_seen_at AS lastSeenAt
    FROM jobs j JOIN companies c ON c.id = j.company_id
    ${where}
    ORDER BY j.last_seen_at DESC
    LIMIT ?
  `).all(limit);
}

export function closeJobLedger(db) {
  db.close();
}
