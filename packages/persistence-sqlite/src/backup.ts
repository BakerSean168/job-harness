import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function createSqliteBackup(sourcePath: string, destinationPath: string): void {
  const source = resolve(sourcePath);
  const destination = resolve(destinationPath);
  if (source === destination) throw new Error('SQLite backup destination must differ from the source database');
  if (existsSync(destination)) throw new Error(`SQLite backup destination already exists: ${destination}`);
  mkdirSync(dirname(destination), { recursive: true });

  const db = new DatabaseSync(source);
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    db.prepare('VACUUM INTO ?').run(destination);
  } finally {
    db.close();
  }
}
