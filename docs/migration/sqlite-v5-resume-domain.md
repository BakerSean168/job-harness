# SQLite v5 — Resume Domain Persistence

Schema v5 introduces the first-class Resume bounded context without changing Career ownership or deleting the legacy `resume_profile_refs` compatibility table.

## New tables

- `resume_libraries` — versioned document-shaped canonical Resume content.
- `resume_profiles` — mutable role/locale assembly recipes bound to a Library.
- `resume_revisions` — immutable resolved snapshots, unique by Profile revision number/content hash.
- `resume_artifacts` — immutable rendered bytes linked to a Revision.

The structured Library/Profile/Revision bodies are stored as strict Zod-validated JSON. SQL normalizes lifecycle and identity boundaries rather than every resume bullet.

## Compatibility boundary

`resume_profile_refs` is intentionally preserved in v5. Existing Career pages, Campaign filters, Application projections and analytics continue to read it while the new Resume workspace is introduced. Removing this table is a later explicit migration after all consumers have moved.

No v5 migration automatically invents Resume content from a legacy `resume_profile_refs` row. Full content is imported through the explicit Resume legacy importer, where the source YAML and renderer parity can be validated.

## Import semantics

`resume:legacy:import` requires:

```text
--source       legacy Resume repository
--db           target SQLite database
--imported-at  stable ISO timestamp for repeatable migration
```

The import is atomic and version-aware:

- Library/Profile stable IDs are preserved;
- a lower version cannot overwrite a higher version;
- the same version with different content is rejected as a conflict;
- an exact repeat is idempotent;
- dangling Profile references fail before persistence;
- Career rows are not mutated.

## Verified migration evidence — 2026-09-17

A WAL-safe copy of the GCP historical Job Harness corpus was migrated; the source DB itself was not modified.

Before:

```text
schema             2
Jobs             100
Applications      41
ResumeProfileRef   5
Companies          82
```

After:

```text
schema             5
integrity_check    ok
Jobs             100
Applications      41
ResumeProfileRef   5
Companies          82
ResumeLibrary       1
ResumeProfile       5
ResumeRevision      0
ResumeArtifact      0
```

The five imported Profiles were read back from SQLite, resolved through the new Resume application layer and rendered through the new Resume renderer. All five HTML SHA-256 values exactly matched the frozen legacy renderer baseline and the importer reported zero findings.

Running the exact import a second time produced the same result without duplicate rows.

This corpus is an older GCP migration fixture and is not presented as the current Oracle2 production count; production cutover remains a later ticket.
