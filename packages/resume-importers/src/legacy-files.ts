import fs from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';
import { LegacyResumeBundleSchema, type LegacyResumeBundle, type LegacyResumeData } from './legacy-schema';

function readYaml(filePath: string): unknown {
  return load(fs.readFileSync(filePath, 'utf8'));
}

function readArray(dataDir: string, fileName: string): unknown[] {
  const filePath = path.join(dataDir, fileName);
  if (!fs.existsSync(filePath)) return [];
  const value = readYaml(filePath);
  return Array.isArray(value) ? value : [];
}

function readFolder(dataDir: string, folder: string): unknown[] {
  const dir = path.join(dataDir, folder);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.yaml'))
    .sort()
    .map((file) => readYaml(path.join(dir, file)));
}

function loadTree(root: string, relativeDataDir: string): LegacyResumeData {
  const dataDir = path.join(root, relativeDataDir);
  const base = readYaml(path.join(dataDir, 'resume.yaml')) as Record<string, unknown>;
  return {
    ...base,
    education: readArray(dataDir, 'education.yaml'),
    skills: readArray(dataDir, 'skills.yaml'),
    work: readFolder(dataDir, 'work'),
    projects: readFolder(dataDir, 'projects'),
    certificates: readArray(dataDir, 'certificates.yaml'),
    summary: readArray(dataDir, 'summary.yaml'),
  } as LegacyResumeData;
}

export function loadLegacyResumeRepository(root: string): LegacyResumeBundle {
  const profileDir = path.join(root, 'config', 'profiles');
  const profiles = fs.readdirSync(profileDir)
    .filter((file) => file.endsWith('.yaml'))
    .sort()
    .map((file) => readYaml(path.join(profileDir, file)));
  const candidate = {
    zh: loadTree(root, 'data'),
    ...(fs.existsSync(path.join(root, 'en', 'data', 'resume.yaml')) ? { en: loadTree(root, path.join('en', 'data')) } : {}),
    profiles,
  };
  return LegacyResumeBundleSchema.parse(candidate);
}
