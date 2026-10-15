import { runCampaignLifecycleSweep } from '@job-harness/persistence-sqlite';

/**
 * Operator-only maintenance. Preview by default. There is no implicit access to
 * production credentials or automatic archiving from a search discovery alone.
 *
 * Usage: pnpm jobs:lifecycle:sweep -- --db /data/career.db --campaign <id>
 * Apply: pnpm jobs:lifecycle:sweep -- --db /data/career.db --campaign <id> --apply
 */
const args = process.argv.slice(2);
const arg = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const databasePath = arg('--db') ?? process.env.JOB_HARNESS_DB_PATH;
const campaignId = arg('--campaign');
if (!databasePath || !campaignId) {
  console.error('Required: --db <SQLite path> --campaign <Campaign ID> [--apply] [--as-of ISO] [--limit N]');
  process.exitCode = 2;
} else {
  const result = runCampaignLifecycleSweep({
    databasePath,
    campaignId,
    asOf: arg('--as-of') ?? new Date().toISOString(),
    apply: args.includes('--apply'),
    ...(arg('--limit') ? { limit: Number(arg('--limit')) } : {}),
    ...(arg('--grace-hours') ? { graceHours: Number(arg('--grace-hours')) } : {}),
  });
  console.log(JSON.stringify(result, null, 2));
}
