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
2. imports pool entries and historical observations through batch Job upsert;
3. keeps generic careers pages as sources rather than canonical Job identity;
4. reconciles the latest pool snapshot after historical observations;
5. records formal applications only for legacy `applied` records;
6. restores known `screening` state from legacy application status;
7. maps legacy resume profile IDs to registered Resume references;
8. uses a dataset fingerprint so rerunning the exact same migration is a no-op.

It intentionally does not interpret `contacted` as a formal application. That state remains a known/shortlisted Job unless a historical `applied` record exists.
