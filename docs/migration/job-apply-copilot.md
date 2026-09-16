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
