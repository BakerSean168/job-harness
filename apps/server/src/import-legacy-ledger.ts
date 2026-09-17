import { isAbsolute, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createCareerApplicationService } from '@job-harness/application';
import { importLegacyCentralJobLedger, readLegacyCentralJobLedger } from '@job-harness/importers';
import { SqliteCareerStore } from '@job-harness/persistence-sqlite';

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const { values } = parseArgs({
  args,
  options: {
    ledger: { type: 'string' },
    db: { type: 'string' },
    campaign: { type: 'string' },
    'imported-at': { type: 'string' },
  },
  strict: true,
});

if (!values.ledger) {
  throw new Error('Usage: import:legacy-ledger --ledger <jobs.sqlite3> [--db <career.db>] [--campaign <campaignId>] [--imported-at <ISO timestamp>]');
}
const invocationCwd = process.env.INIT_CWD ?? process.cwd();
const resolveFromInvocation = (value: string) => isAbsolute(value) ? value : resolve(invocationCwd, value);
const databasePath = resolveFromInvocation(values.db ?? process.env.JOB_HARNESS_DB ?? './data/job-harness.db');
const ledgerPath = resolveFromInvocation(values.ledger);
const importedAt = values['imported-at'] ?? new Date().toISOString();
const dataset = readLegacyCentralJobLedger(ledgerPath);
const store = new SqliteCareerStore(databasePath);
try {
  const career = createCareerApplicationService(store);
  const report = await importLegacyCentralJobLedger(dataset, career, {
    importedAt,
    ...(values.campaign ? { campaignId: values.campaign } : {}),
  });
  const pipeline = await career.analytics.getPipelineStats({});
  const campaignPipeline = values.campaign ? await career.analytics.getPipelineStats({ campaignId: values.campaign }) : null;
  console.log(JSON.stringify({ databasePath, ledgerPath, report, pipeline, campaignPipeline }, null, 2));
} finally {
  store.close();
}
