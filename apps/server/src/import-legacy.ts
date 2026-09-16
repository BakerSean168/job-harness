import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createCareerApplicationService } from '@job-harness/application';
import { ResumeProfileRefSchema, type ResumeProfileRef } from '@job-harness/contracts';
import {
  importLegacyJobApplyCopilot,
  parseLegacyApplicationPool,
  parseLegacyApplicationsJsonl,
} from '@job-harness/importers';
import { SqliteCareerStore } from '@job-harness/persistence-sqlite';

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;

const { values } = parseArgs({
  args,
  options: {
    applications: { type: 'string' },
    pool: { type: 'string' },
    'resume-manifest': { type: 'string' },
    db: { type: 'string' },
    'imported-at': { type: 'string' },
  },
  strict: true,
});

if (!values.applications || !values.pool) {
  throw new Error('Usage: import:legacy --applications <applications.jsonl> --pool <current.json> [--resume-manifest <resumes.json>] [--db <career.db>]');
}

const invocationCwd = process.env.INIT_CWD ?? process.cwd();
const resolveFromInvocation = (value: string) => isAbsolute(value) ? value : resolve(invocationCwd, value);

const databasePath = resolveFromInvocation(values.db ?? process.env.JOB_HARNESS_DB ?? './data/job-harness.db');
const applicationsPath = resolveFromInvocation(values.applications);
const poolPath = resolveFromInvocation(values.pool);
const importedAt = values['imported-at'] ?? new Date().toISOString();

const applications = parseLegacyApplicationsJsonl(await readFile(applicationsPath, 'utf8'));
const pool = parseLegacyApplicationPool(await readFile(poolPath, 'utf8'));
let resumes: ResumeProfileRef[] | undefined;
if (values['resume-manifest']) {
  const resumeManifestPath = resolveFromInvocation(values['resume-manifest']);
  resumes = ResumeProfileRefSchema.array().parse(JSON.parse(await readFile(resumeManifestPath, 'utf8')));
}

const store = new SqliteCareerStore(databasePath);
try {
  const career = createCareerApplicationService(store);
  const report = await importLegacyJobApplyCopilot(
    { applications, pool },
    career,
    { importedAt, ...(resumes ? { resumes } : {}) },
  );
  const pipeline = await career.analytics.getPipelineStats({});
  const applicationPage = await career.applications.listApplications({ limit: 200, offset: 0 });
  console.log(JSON.stringify({
    databasePath,
    report,
    pipeline,
    applicationCount: applicationPage.total,
  }, null, 2));
} finally {
  store.close();
}
