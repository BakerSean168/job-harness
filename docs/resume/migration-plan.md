# Resume -> Job Harness Migration Plan

## Protected contracts

The migration must preserve:

- 104 Jobs / 41 Applications / 84 Companies in the current production Career database;
- the five canonical Resume profile identities;
- all five current PDF bytes and SHA-256 values until explicitly superseded by a published Revision;
- existing Application -> Resume compatibility reads during migration;
- current Job Harness Web/REST/MCP auth boundaries;
- Oracle2 backup/restore before any old runtime is retired.

The dirty standalone Resume worktree is read-only during migration until its baseline has been archived.

## JH-R000 — Freeze Resume baseline

Completed criteria:

- record Resume Git HEAD and `origin/main` independently;
- run current validation suite;
- archive all committed refs as a Git bundle;
- archive binary dirty diff + staged diff;
- archive non-ignored untracked files;
- archive all current PDFs and SHA-256 manifest;
- do not include `.env` or ignored credentials.

## JH-R001 — Freeze Resume Domain v2

Introduce transport/persistence-independent vocabulary and strict runtime contracts for:

- ResumeLibrary;
- LocalizedText and semantic periods;
- ProjectPresentation;
- ResumeProfile and typed selections/overrides;
- ResolvedResume;
- ResumeRevision;
- ResumeArtifact;
- cross-object stable-ID reference validation.

No SQLite, renderer or Web UI in this ticket.

## JH-R002 — Port the existing renderer

Move the valuable runtime pieces only:

- Nunjucks templates;
- profile resolution semantics;
- resume CSS / photo assets;
- HTML renderer;
- current validation logic that still applies.

Build a migration adapter from old YAML structures to v2 contracts. Establish HTML/visual regression fixtures for all five profiles before changing UI.

### R002 parity evidence — 2026-09-17

The migration dry-run against the frozen dirty Resume source resolves all five canonical Profiles through the new v2 domain and reproduces the old rendered HTML byte-for-byte:

- 5/5 profiles resolve successfully;
- 5/5 HTML SHA-256 values match the frozen legacy renderer baseline;
- 0 migration findings;
- imported Library counts: 1 education, 36 skill blocks, 1 work experience, 7 projects, 3 certificates and 14 summary blocks.

No personal rendered HTML or profile photo is committed to the public Job Harness repository; only hashes and template/CSS source baselines are tracked.

## JH-R003 — SQLite Resume persistence

Add a new Job Harness schema migration with document-shaped Resume tables. Import the merged zh/en Library and five Profiles. Keep legacy `resume_profile_refs` as a read compatibility projection until all consumers move.

Do not alter Career counts.

### R003 persistence evidence — 2026-09-17

SQLite v5 now owns document-shaped Resume Library/Profile/Revision/Artifact persistence while preserving `resume_profile_refs` as a compatibility table. A consistent copy of the GCP historical Career database migrated from schema v2 to v5 with Career counts unchanged; the real five-profile legacy import produced one Library + five Profiles, zero findings, 5/5 exact HTML parity, and remained idempotent on a second run. Production Oracle2 is intentionally untouched in this ticket.

## JH-R004 — Resume Workspace

Replace the Registry-only `/resumes` page with:

- profile list;
- structured Form editor;
- Source/YAML editor over the same draft object;
- live unsaved preview;
- explicit shared-content vs profile-only edit scope;
- existing application-usage analytics.

Browser code never receives the Job Harness API bearer token.

### R004 evidence — 2026-09-17

The new `/resumes` workspace now reads Resume Domain v2 through typed REST rather than direct SQLite access. It supports structured Profile/shared-content editing, YAML source mode, debounced unsaved preview through the same resolver/renderer, optimistic version checks, cross-Profile validation for shared Library mutations, and browser/in-app navigation protection while either edit scope is dirty. The write path is covered by real SQLite + REST + Server Action tests; full repository verification passes 80 tests plus production Next build and deployment-topology checks.

## JH-R005 — Revision lifecycle

Add Publish, History and Diff. Revisions are immutable and identified by resolved-document hash. Autosave/edit does not create revisions.

### R005 evidence — 2026-09-17

Publishing is now distinct from draft Save. The application service hashes canonical resolved snapshots with stable object-key ordering, reuses an existing Revision when content is unchanged, and assigns monotonic per-Profile revision numbers only for new content. Publish validates the exact Profile and Library versions the user saw. REST/OpenAPI/client expose immutable history, detail and structured JSON-pointer diff against the previous Revision or current saved state. The Resume Workspace can publish, browse history and inspect diffs. Full repository verification passes 83 tests plus production Next build and deployment-topology checks.

## JH-R006 — Artifact pipeline

Add immutable HTML/PDF/JSON artifact generation. Preserve existing Nunjucks/print-CSS behavior first. PDF rendering is isolated behind a private Chromium sidecar so Career/API runtime does not own browser dependencies. Artifact files live under the durable data root, are keyed by immutable Revision metadata, and are verified by SHA-256 on download. GCP production-shaped Docker smoke must prove render → persist → restart → re-download before the Oracle2 ARM64 spike. Markdown remains a later interoperability format rather than an R006 gate.


### R006 local evidence — 2026-09-17

GCP validation now covers a three-service production topology: private Chromium renderer (`:3002`) → private REST/MCP Server (`:3000`) → loopback Web. A fresh Debian Chromium image with Noto CJK fonts generated a real PDF; the full Compose smoke then published a temporary Revision, materialized a PDF through the Server/sidecar boundary, stored it under the durable Resume artifact directory, verified `%PDF-` on authenticated download, restarted Server, and verified the same artifact again. HTML/JSON artifacts are also materialized and hash-checked without Chromium. Artifact directories use setgid/group-readable permissions so host backup can traverse them.
Oracle2 ARM64 proof also passed against exact commit `a5fe164`: Debian Chromium `152.0.7977.82` ran as the non-root `node` user with a read-only root filesystem, returned 401 without the private bearer and 200 with it, and generated a 30.8 KB `%PDF-` document containing Chinese text. The existing production Web/Server containers remained healthy and untouched throughout the isolated proof.


## JH-R007 — ApplicationSubmission

Introduce first-class actual submission records and migrate existing `application_recorded` / `submission_recorded` facts conservatively. Bind known historical resume bytes to exact imported revisions only when evidence exists; otherwise keep revision/artifact nullable.

Keep Application count stable.

### R007 evidence — 2026-09-17

SQLite schema v6 now owns first-class `ApplicationSubmission` rows instead of deriving submission count from timeline events. New submissions can bind a specific JobListing, channel, Resume Profile ID, immutable Revision and Artifact; a consumer-owned evidence port validates Resume relationships without introducing a Career → Resume package dependency. Historical events are backfilled conservatively: only the first legacy submission inherits the old Application Resume Profile when known, while later Resume/Revision/Artifact evidence remains null rather than guessed. Career export schema v2 preserves Submissions, Application/Job projections count real Submission rows, and Application detail renders a separate auditable Submission history. Full repository verification passes 88 tests plus production Next build, generated OpenAPI drift checks and deployment-topology checks.

## JH-R008 — Analytics

Add Profile/Revision usage projections while keeping causal language prohibited. Metrics are correlations by application/submission stage.

### R008 evidence — 2026-09-17

Resume usage is now derived from immutable `ApplicationSubmission` evidence instead of treating `applications.resume_profile_id` as the source of truth. A Profile counts each associated Application once even when multiple submissions reused it, while `submissions` preserves the exact submit count. Stage counts are distinct Applications at their current stage. Each immutable Revision also exposes associated Application count, Submission count, stage distribution, last use, and the Artifact kinds that were actually submitted. New Resume Domain Profiles are resolved directly from `resume_profiles`; the legacy Registry is only a compatibility fallback, and the old Application resume field is consulted only when an Application has no Submission evidence at all. Application resume filters and Job/Application read models use the same evidence rule, so analytics and drill-down stay consistent. The UI keeps correlation language explicit and exposes Revision usage in Resume history. Full repository verification passes 88 tests, generated OpenAPI drift checks, production Next build and deployment-topology checks.

## JH-R009 — Oracle2 cutover

Acceptance:

- Career counts unchanged;
- five Profile identities present;
- legacy PDF hashes preserved as imported artifacts;
- Resume editor/preview/publish/export work on the durable deployment;
- backup schema upgraded and restore drill verifies every referenced Artifact.

## JH-R010 — Retire standalone Resume runtime

Only after cutover evidence:

- archive standalone runtime state;
- mark old repository runtime as retired/read-only;
- keep research/interview-prep/history where appropriate instead of copying it into production packages;
- update navigation/documentation to one Job Harness Resume entry point.
