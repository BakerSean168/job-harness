import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const resumeRoot = path.resolve(root, '..', 'resume');
const localRoot = path.join(root, '.local');
const stageRoot = path.join(localRoot, 'package-stage');
const channelRoot = path.join(localRoot, 'channel');
const bundlePath = path.join(root, 'data', 'profile-bundle.json');
const resumePdfRoot = path.join(resumeRoot, 'dist', 'pdf');
const bossPublicBaseUrl = String(process.env.JAC_BOSS_PUBLIC_BASE_URL || 'https://oracle.taile92a8e.ts.net:10444').replace(/\/+$/, '');
const steelViewerUrl = String(process.env.JAC_STEEL_VIEWER_BASE_URL || 'https://oracle.taile92a8e.ts.net:10445').replace(/\/+$/, '') + '/ui';

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '0.0.0');
const artifactName = `job-application-copilot-${version}-personal.zip`;
const artifactPath = path.join(channelRoot, artifactName);
const latestPath = path.join(channelRoot, 'job-application-copilot-latest.zip');
const publishedAt = new Date().toISOString();

run('pnpm', ['copilot:sync'], resumeRoot);
if (!fs.existsSync(bundlePath)) throw new Error(`Missing synced profile bundle: ${bundlePath}`);
run(process.execPath, ['scripts/generate-czc-good-job-config.mjs'], root);

const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8')); 
const resumeAssets = (Array.isArray(bundle.profiles) ? bundle.profiles : []).map((profile) => {
  const id = String(profile?.id || '').trim();
  const filename = path.basename(String(profile?.resumePdfName || '').trim());
  if (!id || !/^[A-Za-z0-9._-]+$/.test(id)) throw new Error(`Invalid profile id for resume asset: ${id}`);
  if (!filename) throw new Error(`Missing resumePdfName for profile: ${id}`);
  const sourcePath = path.join(resumePdfRoot, filename);
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing resume PDF for ${id}: ${sourcePath}`);
  return {
    id,
    filename,
    sourcePath,
    size: fs.statSync(sourcePath).size,
    sha256: sha256File(sourcePath),
    apiPath: `/api/resumes/${id}.pdf`
  };
});
const bossUserscripts = (Array.isArray(bundle.profiles) ? bundle.profiles : []).flatMap((profile) => {
  const id = String(profile?.id || '').trim();
  const label = String(profile?.label || id);
  return [
    {
      id,
      label,
      mode: 'screening-only',
      sourcePath: path.join(localRoot, 'czc-good-job', id, 'boss-screening.user.js'),
      filename: `${id}-screening.user.js`,
      path: `/boss/${id}-screening.user.js`
    },
    {
      id,
      label,
      mode: 'only-greet',
      sourcePath: path.join(localRoot, 'czc-good-job', id, 'boss-copilot.user.js'),
      filename: `${id}.user.js`,
      path: `/boss/${id}.user.js`
    }
  ];
});
for (const userscript of bossUserscripts) {
  if (!fs.existsSync(userscript.sourcePath)) {
    throw new Error(`Missing generated BOSS ${userscript.mode} userscript for ${userscript.id}: ${userscript.sourcePath}`);
  }
}

fs.rmSync(stageRoot, { recursive: true, force: true });
fs.mkdirSync(stageRoot, { recursive: true });
fs.mkdirSync(channelRoot, { recursive: true });

for (const name of ['manifest.json', 'LICENSE', 'NOTICE.md']) {
  const source = path.join(root, name);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(stageRoot, name));
}
for (const dir of ['src', 'icons', 'assets']) {
  const source = path.join(root, dir);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(stageRoot, dir), { recursive: true });
}
fs.mkdirSync(path.join(stageRoot, 'data'), { recursive: true });
fs.copyFileSync(bundlePath, path.join(stageRoot, 'data', 'profile-bundle.json'));
const stageResumeRoot = path.join(stageRoot, 'data', 'resumes');
fs.mkdirSync(stageResumeRoot, { recursive: true });
for (const asset of resumeAssets) {
  fs.copyFileSync(asset.sourcePath, path.join(stageResumeRoot, `${asset.id}.pdf`));
}

fs.rmSync(artifactPath, { force: true });
run('python3', ['-m', 'zipfile', '-c', artifactPath, '.'], stageRoot);
fs.copyFileSync(artifactPath, latestPath);
fs.copyFileSync(bundlePath, path.join(channelRoot, 'profile-bundle.json'));
const channelResumeRoot = path.join(channelRoot, 'resumes');
fs.rmSync(channelResumeRoot, { recursive: true, force: true });
fs.mkdirSync(channelResumeRoot, { recursive: true });
for (const asset of resumeAssets) {
  fs.copyFileSync(asset.sourcePath, path.join(channelResumeRoot, `${asset.id}.pdf`));
}
const channelBossRoot = path.join(channelRoot, 'boss');
fs.rmSync(channelBossRoot, { recursive: true, force: true });
fs.mkdirSync(channelBossRoot, { recursive: true });
for (const userscript of bossUserscripts) {
  fs.copyFileSync(userscript.sourcePath, path.join(channelBossRoot, userscript.filename));
}
fs.copyFileSync(path.join(root, 'scripts', 'windows-install.ps1'), path.join(channelRoot, 'install.ps1'));
fs.copyFileSync(path.join(root, 'scripts', 'windows-start-boss-chrome.ps1'), path.join(channelRoot, 'boss-chrome.ps1'));

const channel = {
  format: 'JobApplicationCopilotPrivateChannel',
  version: 1,
  publishedAt,
  extension: {
    version,
    filename: artifactName,
    latestFilename: path.basename(latestPath),
    size: fs.statSync(artifactPath).size,
    sha256: sha256File(artifactPath),
    downloadPath: `/download/${artifactName}`,
    latestDownloadPath: '/download/job-application-copilot-latest.zip'
  },
  browser: {
    primary: 'steel-selfhost',
    liveViewUrl: steelViewerUrl,
    localChromeLauncherPath: '/boss-chrome.ps1',
    safetyMode: 'human-login-read-only-screening'
  },
  boss: {
    mode: 'screening-first',
    publicBaseUrl: bossPublicBaseUrl,
    userscripts: bossUserscripts.map((item) => ({
      id: item.id,
      label: item.label,
      mode: item.mode,
      path: item.path,
      sha256: sha256File(item.sourcePath)
    }))
  },
  profile: {
    exportedAt: String(bundle.exportedAt || ''),
    activeProfileId: String(bundle.activeProfileId || ''),
    profiles: Array.isArray(bundle.profiles)
      ? bundle.profiles.map((item) => {
          const asset = resumeAssets.find((candidate) => candidate.id === item.id);
          return {
            id: item.id,
            label: item.label,
            positioning: item.positioning,
            resumePdfName: item.resumePdfName,
            resume: asset
              ? {
                  filename: asset.filename,
                  size: asset.size,
                  sha256: asset.sha256,
                  path: asset.apiPath
                }
              : null
          };
        })
      : [],
    size: fs.statSync(bundlePath).size,
    sha256: sha256File(bundlePath),
    path: '/api/profile-bundle.json'
  }
};
fs.writeFileSync(path.join(channelRoot, 'channel.json'), `${JSON.stringify(channel, null, 2)}\n`, 'utf8');

console.log(`Published private channel ${version}`);
console.log(`Artifact: ${artifactPath}`);
console.log(`SHA256: ${channel.extension.sha256}`);
console.log(`Profiles: ${channel.profile.profiles.map((item) => item.id).join(', ')}`);

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}`);
}
function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
