import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../plugin/manifest.json', import.meta.url), 'utf8'));
const rootPackage = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const required = ['schemaVersion', 'id', 'name', 'version', 'kind', 'provides'];
for (const key of required) {
  if (!(key in manifest)) throw new Error(`plugin/manifest.json missing required field: ${key}`);
}
if (manifest.id !== 'job-harness') throw new Error('manifest id must be job-harness');
if (manifest.version !== rootPackage.version) throw new Error('manifest version must match root package version');
if (!Array.isArray(manifest.provides) || manifest.provides.length === 0) {
  throw new Error('manifest provides must be a non-empty array');
}
if (new Set(manifest.provides).size !== manifest.provides.length) {
  throw new Error('manifest provides must not contain duplicate capabilities');
}
if (manifest.runtimeIntegration !== false) {
  throw new Error('runtimeIntegration must stay false until a real host integration exists');
}
console.log(`manifest ok: ${manifest.id}@${manifest.version} (${manifest.provides.length} capabilities)`);
