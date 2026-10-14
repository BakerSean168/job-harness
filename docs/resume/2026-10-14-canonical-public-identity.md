# Resume canonical public identity (2026-10-14)

## Decision

Four role-specific, one-page A4 resumes are the only active canonical documents.
The historical label "v5.1" is implementation provenance **not** part of a
recruiter-visible file name, UI title, PDF title, or default attachment label.

| Internal stable Profile ID (do not rename) | Public display name | Public PDF filename |
|---|---|---|
| `ai-frontend-v5-1` | 前端开发工程师 | `卢楼豪-前端开发工程师.pdf` |
| `ai-fullstack-v5-1` | 全栈开发工程师 | `卢楼豪-全栈开发工程师.pdf` |
| `ai-fullstack-agent-v5-1` | AI 全栈开发工程师 | `卢楼豪-AI全栈开发工程师.pdf` |
| `ai-agent-app-v5-1` | AI Agent 应用开发工程师 | `卢楼豪-AIAgent应用开发工程师.pdf` |

Profile IDs, immutable Revision IDs, and old Revision snapshots are **not**
renamed or deleted. Renaming a stable key would invalidate Campaign,
ApplicationSubmission, SiteResumeBinding, and historical audit references.

## Data and code boundaries

- `scripts/resume-canonical-names.mts` performs a guarded metadata-only change
  against Library V19 and four expected Profile revisions. It bumps each Profile
  version but does not change the library, skills, projects, or historical revisions.
  Run `check`, optionally `preview`, and only then `commit` against a verified
  SQLite snapshot or production database. The script must not be rerun after success.
- `packages/resume-contracts/src/file-name.ts` provides one safe public basename
  and PDF filename policy. It strips the obsolete V5.1 suffix for frozen historical
  snapshots without mutating immutable evidence.
- Apply Bundle, email application preparation, site upload, and Web downloads
  derive recipient-facing filenames from the frozen Revision and this shared
  policy. Web downloads no longer expose Revision-number suffixes. Revision
  provenance stays accessible through Job Harness history and artifact IDs.
- `career_resumes_list` and `career_context_get` default to current first-class
  Profiles. `resume_profile_refs` is *not* deleted: old applications continue to
  resolve old IDs. The optional `includeLegacy` flag requests the compatibility
  registry explicitly for JSON exports/forensic audit. Legacy-only installations
  still work until their first migration.
- The campaign editor and Resume Usage catalog offer only active first-class
  Profiles after migration, while individual historical application details
  continue to resolve old IDs.

## Acceptance and follow-up

1. Targeted test coverage: `packages/resume-contracts/test/file-name.spec.ts`,
   `packages/persistence-sqlite/test/canonical-resume-catalog.spec.ts`, and
   `apps/server/test/email-application.spec.ts`.
2. Require `pnpm check` and CI to pass on the final commit SHA.
3. Preview all four with the official PDF renderer and verify 1 page A4,
   project links, readable text, proper metadata title and zero V5.1 suffix.
4. Back up production SQLite online before changing metadata; publish a new
   immutable Revision and materialize each new PDF Artifact. Existing intent
   and application evidence remains unchanged.
5. Synchronize the user-facing `data/resumes-v5-1/` old export directory to a
   version-free `data/resumes-current/` with four canonical filenames.
   Old directories may be archived only after reference checks; they are not
   evidence of which frozen Artifact an application actually used.
6. Deploy updated server/web images and verify `career_context_get` returns
   only the four current Profiles. Other integrations that store copies of
   uploaded files (such as recruiting-site online resume banks) may require
   an explicit resync; changing the Job Harness filename cannot rename an
   already-uploaded file at a recruiting site.
