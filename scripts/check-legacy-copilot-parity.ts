import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { classifyObservedApplySite, observedApplySiteAdapters } from '@job-harness/apply-adapters';

async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, '..');

  const requiredAdapters = new Set([
    'zhilian-ats',
    'liepin-ats',
    'nowcoder-ats',
    'moka-social-recruitment',
    'legacy-moka-ats',
    'beisen-ats',
    'feishu-jobs-ats',
    'hotjob-ats',
    'zhiye-ats',
  ]);

  const actualAdapters = new Set(observedApplySiteAdapters().map((adapter) => adapter.descriptor.id));
  for (const id of requiredAdapters) {
    if (!actualAdapters.has(id)) throw new Error(`Legacy Copilot parity lost observed ATS adapter '${id}'`);
  }

  const routes = [
    ['https://www.zhaopin.com/jobdetail/CC1.htm', 'zhilian-ats', true],
    ['https://www.liepin.com/job/1985379181.shtml', 'liepin-ats', true],
    ['https://www.nowcoder.com/jobs/detail/463747', 'nowcoder-ats', false],
    ['https://app.mokahr.com/social-recruitment/acme/123/#/job/job-1', 'moka-social-recruitment', false],
    ['https://acme.mokahr.com/apply/acme/123/#/job/job-1', 'legacy-moka-ats', false],
    ['https://acme.italentx.com/recruitment/job/123', 'beisen-ats', false],
    ['https://jobs.feishu.cn/acme/position/123', 'feishu-jobs-ats', false],
    ['https://acme.hotjob.cn/wt/acme/web/index/webPositionN310', 'hotjob-ats', false],
    ['https://acme.zhiye.com/social/jobs/123', 'zhiye-ats', false],
  ] as const;

  for (const [url, adapterId, requiresSiteResumeBinding] of routes) {
    const route = classifyObservedApplySite(url);
    if (!route || route.adapterId !== adapterId || route.requiresSiteResumeBinding !== requiresSiteResumeBinding) {
      throw new Error(`Legacy Copilot parity route mismatch for ${url}: ${JSON.stringify(route)}`);
    }
  }

  const [formEngine, semanticMapper, bossSource, bossCli, bossBrowserWorker, applicantReference, dispatcher, notice] = await Promise.all([
    readFile(resolve(root, 'packages/browser-form-engine/browser/runtime.js'), 'utf8'),
    readFile(resolve(root, 'apps/apply-worker/src/semantic-mapper.ts'), 'utf8'),
    readFile(resolve(root, 'integrations/boss/legacy-copilot.user.js'), 'utf8'),
    readFile(resolve(root, 'apps/server/src/boss-outreach-bridge-cli.ts'), 'utf8'),
    readFile(resolve(root, 'apps/boss-browser-worker/src/runtime.ts'), 'utf8'),
    readFile(resolve(root, 'apps/web/src/components/management/applicant-reference-panel.tsx'), 'utf8'),
    readFile(resolve(root, 'apps/intent-dispatch-worker/src/runtime.ts'), 'utf8'),
    readFile(resolve(root, 'NOTICE.md'), 'utf8'),
  ]);

  for (const marker of [
    'OpenJobAutofill',
    'id: "liepin"',
    'id: "moka"',
    'id: "beisen"',
    'id: "nowcoder"',
    'id: "zhaopin"',
    'id: "feishu-jobs"',
    'isResumeFileInput',
    'fillCustomChoice',
    'fillDatePicker',
  ]) {
    if (!formEngine.includes(marker)) throw new Error(`Browser Form Engine lost legacy compatibility marker '${marker}'`);
  }

  for (const marker of ['SemanticMappingProposalSchema', 'allowAiMapping', "entry.sensitivity !== 'protected'", 'response_format']) {
    if (!semanticMapper.includes(marker)) throw new Error(`Semantic mapper lost privacy/validation marker '${marker}'`);
  }

  for (const marker of [
    'SEARCHBTN',
    'JOBLIST',
    'STARTCHAT',
    'RESUMESEND',
    'sendResume',
    'JAC_HARD_ONLY_GREET',
  ]) {
    if (!bossSource.includes(marker)) throw new Error(`Vendored BOSS compatibility source lost marker '${marker}'`);
  }

  for (const marker of ['runBossBrowserDiscovery', 'scanActions', 'driver.scroll', 'reportDiscovery', 'logDecision']) {
    if (!bossBrowserWorker.includes(marker)) throw new Error(`BOSS Browser Provider parity lost marker '${marker}'`);
  }
  for (const marker of ['navigator.clipboard.writeText', 'ApplicantProfileContext', 'ApplicationAnswerSetContext', 'copyVisible']) {
    if (!applicantReference.includes(marker)) throw new Error(`Applicant reference/quick-copy parity lost marker '${marker}'`);
  }

  if (bossCli.includes('/home/ubuntu/projects/job-application-copilot')) {
    throw new Error('BOSS bridge still depends on the retired Job Application Copilot checkout');
  }
  if (!bossCli.includes('/home/ubuntu/projects/job-harness/integrations/boss/legacy-copilot.user.js')) {
    throw new Error('BOSS bridge does not use the Job Harness-owned compatibility source by default');
  }
  if (!dispatcher.includes('classifyObservedApplySite') || !dispatcher.includes("executionMode: 'fill_only'") || !dispatcher.includes('submitAllowed: false')) {
    throw new Error('Legacy ATS automatic dispatch must stay centralized, fill-only and non-submitting');
  }
  if (!notice.includes('OpenJobAutofill') || !notice.includes('czc-good-job')) {
    throw new Error('Third-party attribution is incomplete');
  }

  console.log(`legacy copilot parity ok: ${requiredAdapters.size} observed ATS adapters + vendored BOSS automation + direct BOSS Browser Provider + quick-copy reference + shared form/resume/semantic engine`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
