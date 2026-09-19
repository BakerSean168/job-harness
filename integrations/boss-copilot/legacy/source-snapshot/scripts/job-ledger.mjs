#!/usr/bin/env node
import fs from 'node:fs';
import {
  DEFAULT_JOB_LEDGER_PATH,
  openJobLedger,
  upsertJob,
  recordApplication,
  lockCompanyApplications,
  checkDuplicate,
  getLedgerStats,
  listPrimaryQueue,
  listJobs,
  addCompanyAlias,
} from './lib/job-ledger.mjs';

const [command = 'stats', ...args] = process.argv.slice(2);
const dbArgIndex = args.indexOf('--db');
const dbPath = dbArgIndex >= 0 ? args[dbArgIndex + 1] : DEFAULT_JOB_LEDGER_PATH;
const db = openJobLedger(dbPath);

function arg(name, fallback = '') {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] != null ? args[i + 1] : fallback;
}
function payload() {
  const raw = arg('--json');
  if (!raw) throw new Error('--json is required');
  return JSON.parse(raw);
}
function print(value) { console.log(JSON.stringify(value, null, 2)); }

try {
  if (command === 'init') print({ ok: true, dbPath, stats: getLedgerStats(db) });
  else if (command === 'upsert-job') print(upsertJob(db, payload()));
  else if (command === 'mark-applied') print(recordApplication(db, payload()));
  else if (command === 'lock-company') print(lockCompanyApplications(db, payload()));
  else if (command === 'check') print(checkDuplicate(db, payload()));
  else if (command === 'stats') print(getLedgerStats(db));
  else if (command === 'queue') print(listPrimaryQueue(db, Number(arg('--limit', '100'))));
  else if (command === 'list') print(listJobs(db, { limit: Number(arg('--limit', '200')), includeSuppressed: args.includes('--include-suppressed') }));
  else if (command === 'alias') print(addCompanyAlias(db, arg('--company'), arg('--alias')));
  else if (command === 'import') {
    const file = arg('--file');
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(rows)) throw new Error('import file must contain a JSON array');
    const results = rows.map((row) => upsertJob(db, row));
    print({ imported: rows.length, newJobs: results.filter((x) => x.isNew).length, duplicates: results.filter((x) => x.duplicate).length, stats: getLedgerStats(db) });
  } else throw new Error(`unknown command: ${command}`);
} finally {
  db.close();
}
