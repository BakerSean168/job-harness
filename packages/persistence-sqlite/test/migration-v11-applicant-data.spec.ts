import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrateSqliteDatabase, SQLITE_SCHEMA_VERSION } from '../src/schema';

describe('SQLite v11 applicant data migration', () => {
  it('creates profile and answer-set revision stores', () => {
    const db = new DatabaseSync(':memory:');
    migrateSqliteDatabase(db);
    expect(SQLITE_SCHEMA_VERSION).toBe(11);
    expect(Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)).toBe(11);
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{name:string}>).map((row) => row.name);
    expect(names).toContain('applicant_profiles');
    expect(names).toContain('applicant_profile_revisions');
    expect(names).toContain('application_answer_sets');
    expect(names).toContain('application_answer_set_revisions');
    db.close();
  });
});
