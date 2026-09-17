import { importResumeCatalog, createResumeApplicationService } from '@job-harness/resume-application';
import { ResumeLibrarySchema, ResumeProfileSchema } from '@job-harness/resume-contracts';
import { SqliteResumeStore } from '@job-harness/persistence-sqlite';

const both = (value: string) => ({ 'zh-CN': value, en: value });

async function main() {
  const databasePath = process.argv[2] ?? '/data/job-harness.db';
  const now = '2026-09-17T03:30:00.000Z';
  const store = new SqliteResumeStore(databasePath);
  try {
    const library = ResumeLibrarySchema.parse({
      id: 'deployment-smoke-library',
      schemaVersion: 2,
      version: 1,
      basics: {
        displayName: both('Deployment Smoke'),
        contact: { phone: null, email: 'smoke@example.invalid', website: null, github: null, location: null },
        photoAssetId: null,
      },
      education: [],
      skills: [{ id: 'typescript', label: null, content: both('<strong>TypeScript:</strong> deployment smoke'), keywords: ['typescript'] }],
      workExperiences: [],
      projects: [],
      certificates: [],
      summaries: [],
      createdAt: now,
      updatedAt: now,
    });
    const profile = ResumeProfileSchema.parse({
      id: 'deployment-smoke-profile',
      libraryId: library.id,
      version: 1,
      name: both('Deployment Smoke Resume'),
      targetRole: both('AI Engineer'),
      locale: 'en',
      templateId: 'classic-v1',
      positioning: both('AI Engineer'),
      output: { documentTitle: both('Deployment Smoke Resume'), description: null, onlineUrl: null, pdfName: both('deployment-smoke-resume') },
      layout: { header: 'without-photo', pageSize: 'A4' },
      sectionOrder: ['skills'],
      educationIds: [],
      skillIds: ['typescript'],
      workSelections: [],
      projectSelections: [],
      certificateIds: [],
      summaryIds: [],
      overrides: [],
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await importResumeCatalog(store, { library, profiles: [profile] });
    const resume = createResumeApplicationService(store, { now: () => now });
    const published = await resume.publishRevision({
      profileId: profile.id,
      expectedProfileVersion: profile.version,
      expectedLibraryVersion: library.version,
      note: 'deployment smoke',
    });
    process.stdout.write(`${published.revision.id}\n`);
  } finally {
    store.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
