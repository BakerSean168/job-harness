import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createApplicantApplicationService } from '@job-harness/applicant-application';
import { ApplicantProfileSchema, ApplicationAnswerSetSchema } from '@job-harness/applicant-contracts';
import { SqliteApplicantStore } from '../src/applicant-store';

describe('SqliteApplicantStore', () => {
  it('versions mutable applicant data into immutable revisions', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jh-applicant-'));
    const store = new SqliteApplicantStore(join(dir, 'job-harness.db'));
    const service = createApplicantApplicationService(store, { now: () => '2026-09-17T15:00:00.000Z', idFactory: (() => { let n=0; return () => `id-${++n}`; })() });
    const profile = ApplicantProfileSchema.parse({ id:'default-applicant', version:1, displayName:'Candidate', phone:'13800000000', email:'candidate@example.com', location:'杭州', website:null, github:'https://github.com/example', education:[{id:'edu-1',school:'Example University',major:'IoT',degree:'本科',department:null,location:'成都',startMonth:'2022-09',endMonth:'2026-06'}], targetRoles:['前端开发工程师'], targetCities:['杭州'], availableFrom:'立即到岗', notes:null, createdAt:'2026-09-17T15:00:00.000Z', updatedAt:'2026-09-17T15:00:00.000Z' });
    const answers = ApplicationAnswerSetSchema.parse({ id:'default-application-answers', version:1, name:'默认投递问答', entries:[], createdAt:'2026-09-17T15:00:00.000Z', updatedAt:'2026-09-17T15:00:00.000Z' });
    const boot = await service.ensureDefaults({ profile, answerSet: answers });
    expect(boot.profile.latestRevision.revisionNumber).toBe(1);
    const saved = await service.saveProfile({ expectedVersion:1, profile:{...boot.profile.profile, location:'深圳'} });
    expect(saved.profile.version).toBe(2);
    expect(saved.latestRevision.revisionNumber).toBe(2);
    expect(saved.latestRevision.snapshot.location).toBe('深圳');
    expect((await store.getProfileRevision(boot.profile.latestRevision.id))?.snapshot.location).toBe('杭州');
    store.close(); rmSync(dir,{recursive:true,force:true});
  });
});
