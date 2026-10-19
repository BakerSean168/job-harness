import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UpsertJobsBatchInputSchema } from '../packages/contracts/src/operations';

export interface BatchValidationReport {
  valid: boolean;
  count: number;
  issues: Array<{ path: string; code: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
}

function issuePath(parts: PropertyKey[]): string {
  return parts.reduce<string>((path, part) => typeof part === 'number'
    ? path + '[' + part + ']'
    : path ? path + '.' + String(part) : String(part), '');
}

/** Read-only contract check: no job search, network access or database writes. */
export function validateJobBatch(value: unknown): BatchValidationReport {
  const parsed = UpsertJobsBatchInputSchema.safeParse(value);
  if (!parsed.success) {
    return {
      valid: false,
      count: Array.isArray((value as { jobs?: unknown } | null)?.jobs)
        ? (value as { jobs: unknown[] }).jobs.length : 0,
      issues: parsed.error.issues.map((issue) => ({
        path: issuePath(issue.path),
        code: issue.code,
        message: issue.message,
      })),
      warnings: [],
    };
  }

  const warnings: BatchValidationReport['warnings'] = [];
  for (const [index, job] of parsed.data.jobs.entries()) {
    for (const [listingIndex, listing] of job.listings.entries()) {
      const path = 'jobs[' + index + '].listings[' + listingIndex + ']';
      if (listing.identityKind === 'scoped') {
        warnings.push({
          path: path + '.identityKind',
          message: 'Scoped identity cannot independently deduplicate a generic careers page. Resolve potential matches before upsert.',
        });
      }
      if (listing.status === 'active' && listing.verificationKind !== 'open_confirmed') {
        warnings.push({
          path: path + '.status',
          message: 'Active is an unverified observation, not proof that the posting is currently open.',
        });
      }
    }
  }
  return { valid: true, count: parsed.data.jobs.length, issues: [], warnings };
}

async function main(): Promise<void> {
  if (process.argv.length !== 3) {
    process.stderr.write('Usage: pnpm jobs:batch:validate <batch.json>\n');
    process.exitCode = 2;
    return;
  }
  try {
    const json = JSON.parse(await readFile(resolve(process.argv[2]!), 'utf8')) as unknown;
    const report = validateJobBatch(json);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (!report.valid) process.exitCode = 2;
  } catch (error) {
    process.stderr.write('Unable to read or parse batch JSON: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
