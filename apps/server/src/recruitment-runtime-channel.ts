import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import type { Express } from 'express';
import { GET_JOBS_UPSTREAM_COMMIT, GET_JOBS_UPSTREAM_REPOSITORY } from './get-jobs-runtime';

export const RECRUITMENT_RUNTIME_CHANNEL_PREFIX = '/runtime/recruitment-browser/v1';

interface RuntimeFileDefinition {
  readonly id: string;
  readonly sourcePath: string;
  readonly installPath: string;
  readonly contentType?: string;
}

interface RuntimeExtensionDefinition {
  readonly id: string;
  readonly installDirectory: string;
  readonly startUrls: readonly string[];
  readonly files: readonly RuntimeFileDefinition[];
}

const repositoryRoot = resolve(import.meta.dirname, '../../..');

const bossFiles = [
  'manifest.json',
  'runtime-marker.js',
  'gm-request-shim.js',
  'background.js',
  'boss-copilot.js',
] as const;

const bridgeFiles = [
  'manifest.json',
  'background.js',
  'boss-driver.js',
  'form-engine.js',
  'page-driver.js',
  'options.html',
  'options.js',
  'popup.html',
  'popup.js',
  'ui.css',
] as const;

const EXTENSIONS: readonly RuntimeExtensionDefinition[] = [
  {
    id: 'boss-copilot',
    installDirectory: 'extensions/boss-copilot',
    startUrls: ['https://www.zhipin.com/web/geek/job'],
    files: bossFiles.map((name) => ({
      id: `boss-copilot/${name}`,
      sourcePath: resolve(repositoryRoot, 'integrations/boss-copilot/extension', name),
      installPath: `extensions/boss-copilot/${name}`,
    })),
  },
  {
    id: 'browser-bridge',
    installDirectory: 'extensions/browser-bridge',
    startUrls: [],
    files: bridgeFiles.map((name) => ({
      id: `browser-bridge/${name}`,
      sourcePath: resolve(repositoryRoot, 'integrations/browser-extension', name),
      installPath: `extensions/browser-bridge/${name}`,
    })),
  },
];

const SUPERVISOR: RuntimeFileDefinition = {
  id: 'supervisor/job-harness-browser-supervisor.ps1',
  sourcePath: resolve(repositoryRoot, 'integrations/recruitment-browser/windows/job-harness-browser-supervisor.ps1'),
  installPath: 'supervisor/job-harness-browser-supervisor.ps1',
  contentType: 'text/plain; charset=utf-8',
};

const BOOTSTRAP: RuntimeFileDefinition = {
  id: 'launcher/start-recruitment-browser.ps1',
  sourcePath: resolve(repositoryRoot, 'integrations/recruitment-browser/windows/start-recruitment-browser.ps1'),
  installPath: 'launcher/start-recruitment-browser.ps1',
  contentType: 'text/plain; charset=utf-8',
};

const INSTALLER: RuntimeFileDefinition = {
  id: 'launcher/install-recruitment-browser.ps1',
  sourcePath: resolve(repositoryRoot, 'integrations/recruitment-browser/windows/install-recruitment-browser.ps1'),
  installPath: 'launcher/install-recruitment-browser.ps1',
  contentType: 'text/plain; charset=utf-8',
};

const GET_JOBS_BOOTSTRAP: RuntimeFileDefinition = {
  id: 'external/vvvsrx-get-jobs/start-job-harness-get-jobs.sh',
  sourcePath: resolve(repositoryRoot, 'integrations/get-jobs-runtime/wsl/start-job-harness-get-jobs.sh'),
  installPath: 'external/vvvsrx-get-jobs/start-job-harness-get-jobs.sh',
  contentType: 'text/plain; charset=utf-8',
};

const GET_JOBS_MANAGER: RuntimeFileDefinition = {
  id: 'external/vvvsrx-get-jobs/job-harness-get-jobs-supervisor.sh',
  sourcePath: resolve(repositoryRoot, 'integrations/get-jobs-runtime/wsl/job-harness-get-jobs-supervisor.sh'),
  installPath: 'external/vvvsrx-get-jobs/job-harness-get-jobs-supervisor.sh',
  contentType: 'text/plain; charset=utf-8',
};

const GET_JOBS_OVERLAYS: readonly RuntimeFileDefinition[] = [
  'main.py.patch',
  'schemas.py.patch',
  'zhilian_bot.py.patch',
  'zhilian_locators.py.patch',
  'liepin_bot.py.patch',
  'job51_bot.py.patch',
].map((name) => ({
  id: `external/vvvsrx-get-jobs/overlays/${name}`,
  sourcePath: resolve(repositoryRoot, 'integrations/upstreams/overlays/get-jobs', name),
  installPath: `external/vvvsrx-get-jobs/overlays/${name}`,
  contentType: 'text/plain; charset=utf-8',
}));

function contentType(file: RuntimeFileDefinition): string {
  if (file.contentType) return file.contentType;
  const extension = extname(file.installPath).toLowerCase();
  if (extension === '.json') return 'application/json; charset=utf-8';
  if (extension === '.js') return 'text/javascript; charset=utf-8';
  if (extension === '.html') return 'text/html; charset=utf-8';
  if (extension === '.css') return 'text/css; charset=utf-8';
  return 'application/octet-stream';
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readDefinition(file: RuntimeFileDefinition) {
  const bytes = await readFile(file.sourcePath);
  return {
    id: file.id,
    installPath: file.installPath,
    sha256: sha256(bytes),
    bytes: bytes.length,
    contentType: contentType(file),
    payload: bytes,
  };
}

export async function getRecruitmentRuntimeManifest() {
  const extensions = [];
  const allHashes: string[] = [];

  for (const extension of EXTENSIONS) {
    const files = [];
    for (const file of extension.files) {
      const resolved = await readDefinition(file);
      allHashes.push(`${resolved.id}:${resolved.sha256}`);
      files.push({
        id: resolved.id,
        installPath: resolved.installPath,
        sha256: resolved.sha256,
        bytes: resolved.bytes,
        contentType: resolved.contentType,
      });
    }
    extensions.push({
      id: extension.id,
      installDirectory: extension.installDirectory,
      startUrls: [...extension.startUrls],
      files,
    });
  }

  const supervisor = await readDefinition(SUPERVISOR);
  const supervisorVersion = sha256(Buffer.from(`${supervisor.id}:${supervisor.sha256}`));
  const bundleVersion = sha256(Buffer.from(allHashes.sort().join('\n')));
  const [getJobsBootstrap, getJobsManager, getJobsOverlays] = await Promise.all([
    readDefinition(GET_JOBS_BOOTSTRAP),
    readDefinition(GET_JOBS_MANAGER),
    Promise.all(GET_JOBS_OVERLAYS.map(readDefinition)),
  ]);
  const getJobsVersion = sha256(Buffer.from([
    GET_JOBS_UPSTREAM_COMMIT,
    `${getJobsBootstrap.id}:${getJobsBootstrap.sha256}`,
    `${getJobsManager.id}:${getJobsManager.sha256}`,
    ...getJobsOverlays.map((file) => `${file.id}:${file.sha256}`).sort(),
  ].join('\n')));

  return {
    schemaVersion: 1,
    runtimeId: 'job-harness-recruitment-browser',
    bundleVersion,
    supervisorVersion,
    extensions,
    supervisor: {
      id: supervisor.id,
      installPath: supervisor.installPath,
      sha256: supervisor.sha256,
      bytes: supervisor.bytes,
      contentType: supervisor.contentType,
    },
    launchers: await Promise.all([BOOTSTRAP, INSTALLER].map(async (file) => {
      const resolved = await readDefinition(file);
      return {
        id: resolved.id,
        installPath: resolved.installPath,
        sha256: resolved.sha256,
        bytes: resolved.bytes,
        contentType: resolved.contentType,
      };
    })),
    externalRuntimes: [{
      id: 'vvvsrx-get-jobs',
      version: getJobsVersion,
      repository: GET_JOBS_UPSTREAM_REPOSITORY,
      commit: GET_JOBS_UPSTREAM_COMMIT,
      license: 'MIT',
      mode: 'collect-only',
      sites: ['zhilian', 'liepin', 'job51'],
      bootstrap: {
        id: getJobsBootstrap.id,
        installPath: getJobsBootstrap.installPath,
        sha256: getJobsBootstrap.sha256,
        bytes: getJobsBootstrap.bytes,
        contentType: getJobsBootstrap.contentType,
      },
      manager: {
        id: getJobsManager.id,
        installPath: getJobsManager.installPath,
        sha256: getJobsManager.sha256,
        bytes: getJobsManager.bytes,
        contentType: getJobsManager.contentType,
      },
      overlays: getJobsOverlays.map((file) => ({
        id: file.id,
        installPath: file.installPath,
        sha256: file.sha256,
        bytes: file.bytes,
        contentType: file.contentType,
      })),
    }],
  };
}

function allRuntimeFiles(): RuntimeFileDefinition[] {
  return [...EXTENSIONS.flatMap((extension) => extension.files), SUPERVISOR, BOOTSTRAP, INSTALLER, GET_JOBS_BOOTSTRAP, GET_JOBS_MANAGER, ...GET_JOBS_OVERLAYS];
}

export function registerRecruitmentRuntimeChannel(app: Express): void {
  app.get(`${RECRUITMENT_RUNTIME_CHANNEL_PREFIX}/manifest.json`, async (_req, res, next) => {
    try {
      res.setHeader('cache-control', 'no-store');
      res.json(await getRecruitmentRuntimeManifest());
    } catch (error) {
      next(error);
    }
  });

  app.get(`${RECRUITMENT_RUNTIME_CHANNEL_PREFIX}/files/*path`, async (req, res, next) => {
    try {
      const requested = Array.isArray(req.params.path) ? req.params.path.join('/') : String(req.params.path ?? '');
      const file = allRuntimeFiles().find((candidate) => candidate.id === requested);
      if (!file) {
        res.status(404).json({ error: { code: 'RUNTIME_FILE_NOT_FOUND', message: 'Runtime file was not found' } });
        return;
      }
      const resolved = await readDefinition(file);
      res.setHeader('cache-control', 'no-store');
      res.setHeader('content-type', resolved.contentType);
      res.setHeader('x-content-sha256', resolved.sha256);
      res.send(resolved.payload);
    } catch (error) {
      next(error);
    }
  });
}
