# Resume Context

Job Harness absorbs the runtime responsibilities of the former standalone Resume Harness while keeping Resume as its own bounded context.

The product goal is one career workspace with two explicit owners:

- **Career Context** owns Company, Job, JobListing, Application, Campaign and Discovery.
- **Resume Context** owns structured resume content, target-role profiles, immutable revisions and generated artifacts.

Career may reference Resume identifiers. Career must not own or mutate resume content directly.

## North-star flow

```text
ResumeLibrary
  -> ResumeProfile
  -> ResolvedResume
  -> ResumeRevision (immutable)
  -> ResumeArtifact (HTML/PDF/JSON/Markdown)
  -> ApplicationSubmission
  -> Application
```

A mutable Profile describes how to assemble a resume. A Revision freezes the exact resolved document used at a point in time. An Artifact is the rendered byte output for a Revision.

## Documents

- `open-source-benchmark.md` — external design references and explicit takeaways.
- `domain-model-v2.md` — canonical Resume domain, invariants, ownership and lifecycle.
- `migration-plan.md` — phased migration from the standalone Resume repository.
- `baseline-2026-09-17.md` — verified source baseline for the migration.

## Non-goals

This merge does not introduce a Canva-style freeform designer, a multi-user resume SaaS, a template marketplace, arbitrary browser-side AI rewriting, or a second task/search runtime. Templates and renderers remain code-owned adapters.
