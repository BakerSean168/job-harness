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

  const [supervisor, bootstrap, installer] = await Promise.all([
    readFile(resolve(root, 'integrations/recruitment-browser/windows/job-harness-browser-supervisor.ps1'), 'utf8'),
    readFile(resolve(root, 'integrations/recruitment-browser/windows/start-recruitment-browser.ps1'), 'utf8'),
    readFile(resolve(root, 'integrations/recruitment-browser/windows/install-recruitment-browser.ps1'), 'utf8'),
  ]);

  for (const marker of ['JobHarness\\RecruitmentBrowser', "$currentRoot = Join-Path $runtimeRoot 'current'", '--user-data-dir=', '--load-extension=', '--remote-debugging-port=', 'Get-DedicatedBrowserProcesses', 'Get-FileHash', 'bundleVersion', 'Ensure-SupervisorCurrent', 'Get-RecruitmentSiteHealth', 'login_required', 'challenge']) {
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

  console.log(`recruitment browser runtime ok: bundle ${manifest.bundleVersion.slice(0, 12)}, ${manifest.extensions.length} extensions, ${files.length} extension assets, hash-verified Windows supervisor`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
