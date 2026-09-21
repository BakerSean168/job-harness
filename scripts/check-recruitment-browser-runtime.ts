import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getRecruitmentRuntimeManifest } from '../apps/server/src/recruitment-runtime-channel';

async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, '..');
  const manifest = await getRecruitmentRuntimeManifest();
  if (manifest.schemaVersion !== 1) throw new Error('Recruitment runtime manifest schema mismatch');
  if (!/^[0-9a-f]{64}$/.test(manifest.bundleVersion)) throw new Error('Recruitment runtime bundle version must be content-addressed');
  if (!/^[0-9a-f]{64}$/.test(manifest.supervisorVersion)) throw new Error('Recruitment runtime supervisor version must be content-addressed');

  const extensionIds = manifest.extensions.map((extension) => extension.id);
  if (JSON.stringify(extensionIds) !== JSON.stringify(['boss-copilot', 'browser-bridge'])) {
    throw new Error(`Unexpected Recruitment Browser extensions: ${extensionIds.join(', ')}`);
  }

  const files = manifest.extensions.flatMap((extension) => extension.files);
  const ids = files.map((file) => file.id);
  if (new Set(ids).size !== ids.length) throw new Error('Recruitment runtime file ids must be unique');
  for (const file of files) {
    if (!/^[0-9a-f]{64}$/.test(file.sha256) || file.bytes <= 0) {
      throw new Error(`Invalid runtime file metadata for ${file.id}`);
    }
    if (!file.installPath.startsWith('extensions/')) throw new Error(`Extension asset escaped install root: ${file.installPath}`);
  }

  const external = manifest.externalRuntimes;
  if (external.length !== 1 || external[0]?.id !== 'vvvsrx-get-jobs') throw new Error('Expected exactly one vvvsrx/get_jobs external Runtime candidate');
  const getJobs = external[0]!;
  if (getJobs.mode !== 'collect-only' || getJobs.sites.join(',') !== 'zhilian,liepin,job51') throw new Error('get_jobs external Runtime must remain collection-only for the three approved sites');
  if (!/^[0-9a-f]{64}$/.test(getJobs.version)) throw new Error('get_jobs external Runtime version must be content-addressed');
  if (getJobs.overlays.length !== 7) throw new Error('get_jobs external Runtime overlay set changed unexpectedly');
  for (const file of [getJobs.bootstrap, getJobs.manager, ...getJobs.overlays]) {
    if (!/^[0-9a-f]{64}$/.test(file.sha256) || file.bytes <= 0) throw new Error(`Invalid external Runtime file metadata for ${file.id}`);
  }

  const [supervisor, bootstrap, installer, getJobsBootstrap, getJobsManager, upstreamWatch, packageJson, upstreamRegistryScript] = await Promise.all([
    readFile(resolve(root, 'integrations/recruitment-browser/windows/job-harness-browser-supervisor.ps1'), 'utf8'),
    readFile(resolve(root, 'integrations/recruitment-browser/windows/start-recruitment-browser.ps1'), 'utf8'),
    readFile(resolve(root, 'integrations/recruitment-browser/windows/install-recruitment-browser.ps1'), 'utf8'),
    readFile(resolve(root, 'integrations/get-jobs-runtime/wsl/start-job-harness-get-jobs.sh'), 'utf8'),
    readFile(resolve(root, 'integrations/get-jobs-runtime/wsl/job-harness-get-jobs-supervisor.sh'), 'utf8'),
    readFile(resolve(root, '.github/workflows/upstream-runtime-watch.yml'), 'utf8'),
    readFile(resolve(root, 'package.json'), 'utf8'),
    readFile(resolve(root, 'scripts/upstream-registry.mjs'), 'utf8'),
  ]);

  for (const marker of ['JobHarness\\RecruitmentBrowser', "$currentRoot = Join-Path $runtimeRoot 'current'", '--user-data-dir=', '--load-extension=', '--remote-debugging-port=', 'Get-DedicatedBrowserProcesses', 'Get-FileHash', 'bundleVersion', 'Ensure-SupervisorCurrent', 'Get-RecruitmentSiteHealth', 'Get-BossRuntimeServerHealth', 'Get-BossRuntimeServerControl', 'bossTaskRunning', 'bossRuntimeOfflineStreak', 'lastSelfHealAction', 'lastSelfHealAt', 'login_required', 'challenge']) {
    if (!supervisor.includes(marker)) throw new Error(`Recruitment Browser supervisor lost invariant '${marker}'`);
  }
  for (const forbidden of ['JOB_HARNESS_AUTH_TOKEN', 'JOB_HARNESS_EXECUTOR_AUTH_TOKEN', 'ssh ', 'sqlite3 ', 'server root']) {
    if (supervisor.includes(forbidden) || bootstrap.includes(forbidden) || installer.includes(forbidden)) {
      throw new Error(`Recruitment Browser launcher unexpectedly contains privileged marker '${forbidden}'`);
    }
  }
  if (!bootstrap.includes('supervisor.sha256') || !bootstrap.includes('Get-FileHash')) {
    throw new Error('Recruitment Browser bootstrap must verify the downloaded supervisor hash');
  }
  if (!installer.includes("[Environment]::GetFolderPath('Startup')") || !installer.includes('start-recruitment-browser.ps1')) {
    throw new Error('Recruitment Browser installer lost per-user auto-start bootstrap');
  }
  for (const marker of ['vvvsrx-get-jobs', 'manager_sha', 'sha256sum', '/files/', 'externalRuntimes']) {
    if (!getJobsBootstrap.includes(marker)) throw new Error(`get_jobs WSL bootstrap lost invariant '${marker}'`);
  }
  for (const marker of ['vvvsrx-get-jobs', 'JOB_HARNESS_GET_JOBS_COLLECT_ONLY=1', '/api/job-harness-runtime', 'apply --check', 'sha256sum', '_login_tasks', 'py_compile', '127.0.0.1']) {
    if (!getJobsManager.includes(marker)) throw new Error(`get_jobs WSL supervisor lost invariant '${marker}'`);
  }
  for (const forbidden of ['JOB_HARNESS_AUTH_TOKEN', 'JOB_HARNESS_EXECUTOR_AUTH_TOKEN', 'server root']) {
    if (getJobsBootstrap.includes(forbidden) || getJobsManager.includes(forbidden)) throw new Error(`get_jobs WSL runtime bootstrap unexpectedly contains privileged marker '${forbidden}'`);
  }

  const packageScripts = JSON.parse(packageJson).scripts as Record<string, string>;
  if (packageScripts['upstream:report'] !== 'node scripts/upstream-registry.mjs report') {
    throw new Error('Upstream Runtime watch lost the canonical upgrade-candidate report command');
  }
  for (const marker of ["cron: '17 1 * * 1'", 'pnpm upstream:report', 'actions/upload-artifact@v4', 'pnpm upstream:check --strict-updates']) {
    if (!upstreamWatch.includes(marker)) throw new Error(`Upstream Runtime watch lost invariant '${marker}'`);
  }
  for (const marker of ['upgrade-candidates.json', 'upgrade-candidates.md', 'licenseChanged', 'Overlay conflicts', 'never updates registry pins']) {
    if (!upstreamRegistryScript.includes(marker)) throw new Error(`Upstream Runtime report lost invariant '${marker}'`);
  }

  console.log(`recruitment browser runtime ok: bundle ${manifest.bundleVersion.slice(0, 12)}, ${manifest.extensions.length} extensions, ${files.length} extension assets, external ${getJobs.id}@${getJobs.version.slice(0, 12)} collect-only Runtime, hash-verified supervisors`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
