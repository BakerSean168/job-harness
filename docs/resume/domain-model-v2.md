# Resume Domain v2

## Decision summary

Resume becomes a first-class bounded context inside Job Harness. SQLite will become the runtime authority in the persistence phase. YAML/JSON remain import, export and migration formats. Template/CSS/renderer code remains code-owned.

The model deliberately separates four concepts that the old system partially conflated:

1. **ResumeLibrary** — reusable factual/presentation content.
2. **ResumeProfile** — a mutable recipe for a target role and locale.
3. **ResumeRevision** — an immutable resolved snapshot created by publish.
4. **ResumeArtifact** — immutable bytes rendered from a Revision.

## Aggregate map

```text
ResumeLibrary (mutable, versioned)
├── Basics
├── Education[]
├── SkillBlock[]
├── WorkExperience[]
├── ProjectExperience[]
│   ├── ProjectPresentation[]
│   └── ProjectHighlight[]
├── Certificate[]
└── SummaryBlock[]
        │
        │ stable-id selection
        ▼
ResumeProfile (mutable, versioned)
├── locale
├── templateId
├── sectionOrder
├── work/project selections
├── layout
└── explicit typed overrides
        │
        │ resolve + validate
        ▼
ResolvedResume
        │
        │ publish
        ▼
ResumeRevision (immutable)
        │
        │ render
        ▼
ResumeArtifact[] (immutable)
```

## Localized content

The old repository currently maintains separate `data/` and `en/data/` trees. v2 stores one entity with localized fields:

```ts
type LocalizedText = {
  'zh-CN'?: string;
  en?: string;
};
```

At least one locale must exist. Publishing a Profile is stricter: every selected field required by the target locale must resolve. Publishing must not silently substitute Chinese for missing English or vice versa.

Dates are semantic values (`YYYY-MM`) instead of preformatted strings. The renderer owns locale-specific date formatting.

## ResumeLibrary

`ResumeLibrary` is the reusable content aggregate. It has an integer `version` incremented by every successful canonical-content mutation.

Stable item IDs such as `sicau`, `krjx`, `body-sense` and highlight IDs survive migration. Display text is never an identity.

### Projects and role-specific presentations

The old model selects dynamic property names such as `descriptionAgent` or `stackFrontend`. v2 makes this explicit:

```text
ProjectExperience body-sense
├── presentation default
├── presentation agent
├── presentation frontend
└── presentation fullstack
```

A Profile selects `presentationId="agent"`; it never stores a field name like `descriptionAgent`.

## ResumeProfile

A Profile is an assembly recipe, not historical evidence.

It owns:

- target-role name;
- output locale;
- template ID;
- positioning;
- header/page layout;
- section order;
- selected skill/work/project/certificate/summary IDs;
- selected project presentation IDs;
- typed content overrides for exceptional profile-only wording;
- a monotonically increasing `version`.

Profile selections must reference existing Library IDs. This is a cross-object invariant enforced by the resolver/reference validator, not by string guessing.

### Canonical edit vs profile override

UI must distinguish:

- **Edit shared content** — mutates ResumeLibrary and affects all profiles that select the item.
- **Override this profile** — mutates only ResumeProfile.

The UI must show the blast radius before mutating shared content.

## ResolvedResume

`ResolvedResume` is a single-locale deterministic document created from a Library + Profile pair. It contains no unresolved localized maps and no dynamic field references.

Preview may resolve an unsaved draft. Preview does not create a Revision.

## ResumeRevision

Publish creates a Revision. A Revision has no `updatedAt` and is never mutated.

It records:

- profile ID + profile version;
- library ID + library version;
- revision number within the Profile;
- exact resolved document snapshot;
- deterministic content hash;
- creation actor/time and optional note.

A later Profile edit cannot change an old Revision.

Renderer version is intentionally not owned by Revision. The same semantic Revision may later be rendered by a newer renderer into a different Artifact while preserving the old Artifact.

## ResumeArtifact

An Artifact is immutable rendered output:

- `html`;
- `pdf`;
- `json`;
- `markdown`.

It records byte hash, byte size, storage URI and renderer identity/version. A historical artifact used in a real submission must never be overwritten in place.

## Career boundary

The Resume context must not import Career persistence or Job/Application aggregates.

The eventual integration direction is:

```text
Application
  -> ApplicationSubmission[]
       -> ResumeRevision?
       -> ResumeArtifact?
```

`Application` remains the recruitment pipeline. `ApplicationSubmission` records an actual submit action and the exact Resume bytes/revision used. This also models repeated submissions for one Opportunity without creating duplicate pipeline cards.

Until that migration ticket lands, the current `ResumeProfileRef` remains a compatibility projection.

## Persistence target

Do not create one SQL table per resume bullet. Resume is document-shaped. Normalize lifecycle/identity boundaries only:

```text
resume_libraries
resume_profiles
resume_revisions
resume_artifacts
application_submissions   # later Career migration
```

Library/Profile/Revision structured bodies are strict versioned JSON validated through Zod at the application boundary.

## Version and concurrency rules

- Library/Profile are mutable and use positive integer versions.
- writes later require `expectedVersion` for optimistic concurrency;
- successful shared-content mutation increments Library version exactly once;
- successful Profile mutation increments Profile version exactly once;
- Revision numbers are monotonically increasing per Profile;
- Revision and Artifact are append-only;
- IDs are stable and never derived from display text.

## Rendering ownership

Templates, CSS, fonts and renderer behavior are code. Database rows may reference `templateId` and renderer IDs but must not contain arbitrary executable template source.

Initial renderer migration preserves the existing Nunjucks + semantic HTML + print CSS output. PDF generation will be behind a `ResumeArtifactRendererPort`; Chromium/Playwright may run in a sidecar after an ARM64 spike.

## ATS invariants

A production PDF renderer should preserve:

- selectable text;
- semantic/linear reading order;
- real hyperlinks;
- deterministic A4 layout;
- no canvas/screenshot-only text;
- controlled page breaks;
- reproducible artifact hash for a fixed revision + renderer build.

## Publish lifecycle

```text
Edit Library/Profile
  -> Autosave mutable draft
  -> Preview (no persistence side effect beyond draft save)
  -> Publish
  -> Resolve + strict locale/reference validation
  -> Create immutable ResumeRevision
  -> Render one or more ResumeArtifacts
  -> Use exact revision/artifact for ApplicationSubmission
```

If the current resolved content hash equals the newest Revision hash, export may reuse the existing Revision and create only a missing Artifact for the requested renderer/format.
