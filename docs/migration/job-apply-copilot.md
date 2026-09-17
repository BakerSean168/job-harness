# Importing legacy job-apply-copilot data

Job Harness includes a one-way compatibility importer for the historical `job-apply-copilot` data files. The importer calls only `CareerApplicationPorts`; it never writes SQLite tables directly.

Required inputs:

- `applications.jsonl`
- `application-pool/current.json`

Optional Resume Registry input is a JSON array matching `ResumeProfileRefSchema`.

```bash
pnpm import:legacy -- \
  --applications /path/to/applications.jsonl \
  --pool /path/to/application-pool/current.json \
  --resume-manifest /path/to/resumes.json \
  --db ./data/job-harness.db
```

The importer:

1. creates an auditable `DiscoveryRun(executor=import)`;
2. imports pool entries and historical observations through Opportunity + JobListing upsert;
3. keeps generic careers pages as scoped Listings while job-specific URLs/external IDs become strong Listing identities;
4. treats `company + title + city` only as a potential Opportunity match, never a destructive merge key;
5. reconciles the latest pool snapshot after historical observations;
6. creates one Application pipeline per canonical Opportunity/cycle and preserves repeated confirmed submissions as additional `submission_recorded` timeline events;
7. restores known `screening` state from legacy application status;
8. maps legacy resume profile IDs to registered Resume references, including fallback data from the newer pool snapshot;
9. uses a dataset fingerprint so rerunning the exact same migration is a no-op.

It intentionally does not interpret `contacted` as a formal application. That state remains a known/shortlisted Job unless a historical `applied` record exists.

## Pipeline vs. submission facts

`Application` is the durable hiring pipeline for an Opportunity. A user may submit that same Opportunity more than once (for example, first through a campus page and later through a verified recruiting email). Those are **submission facts**, not automatically separate pipelines.

The importer therefore keeps one `Application` and uses `application_recorded` for the first submission and appends `submission_recorded` for independently evidenced later submissions. This preserves the original chronology without duplicating the funnel.

## Central Job Ledger convergence (R018)

The later `job-application-copilot/.local/job-ledger/jobs.sqlite3` store is a separate historical input from the original JSONL/application-pool snapshot. Import it with the read-only ledger importer:

```bash
pnpm import:legacy-ledger -- \
  --ledger /path/to/job-application-copilot/.local/job-ledger/jobs.sqlite3 \
  --db /path/to/job-harness.db \
  --campaign 2026-grad-agent-fullstack-frontend
```

This importer opens the source SQLite database read-only, fingerprints the dataset, replays the legacy DiscoveryRuns through `CareerApplicationPorts`, and uses canonical JobListing dedupe. A generic careers page remains a scoped listing. Migration-only adoption of an existing Job is allowed only when title/city/company are compatible **and** the legacy candidate shares a source URL with exactly one existing Job; the importer then anchors the upsert to an existing strong Listing identity. A successful strong match also records the historical company spelling as a Company alias, improving future dedupe.

The central ledger's company-only application rows are intentionally not replayed as new Applications when the exact role is missing. They are reconciled against existing concrete Job Harness Applications and reported as covered/unresolved. This prevents placeholder Opportunities and duplicate submissions.
