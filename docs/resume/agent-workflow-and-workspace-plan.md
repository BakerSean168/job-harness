# Job Harness — Workspace / Resume Composer / AI Integration Plan

Status: implementation plan  
Date: 2026-09-17  
Scope: JH-R011..JH-R017  
Owner: Job Harness

## 1. Objective

R009/R010 completed the Resume runtime merge into Job Harness and retired the former standalone Resume Studio. The next phase is not another domain rewrite. The current domain already has the important durable primitives: Job, Application, ApplicationSubmission, DiscoveryRun, ResumeLibrary, ResumeProfile, ResumeRevision, ResumeArtifact, idempotency receipts, REST contracts, and Career MCP tools.

The objective of R011..R017 is to expose those primitives through production-grade workspaces and a reliable AI/executor integration protocol:

1. make high-volume application management usable at hundreds or thousands of records;
2. restore first-class visual selection of Resume Library content into each Resume Profile;
3. make preview pagination match the real Chromium PDF renderer;
4. provide explicit human write entry points for adding Jobs and recording Applications;
5. expose Resume authoring through stable MCP tools instead of raw database or source-file mutation;
6. package the workflow as a ChatGPT-facing integration without making prompts the persistence boundary;
7. make external application submission durable through an executor-owned intent/outbox/reconciliation loop.

## 2. Architectural principles

### 2.1 Job Harness is the sole durable career/resume system of record

No ChatGPT workflow, browser executor, ForgeFlow task, or other agent may write SQLite directly. All mutation must pass through Job Harness application use cases exposed by REST/MCP.

### 2.2 Library truth and Profile composition are separate

`ResumeLibrary` means “facts and reusable authored material that may be used.”

`ResumeProfile` means “the subset and presentation chosen for one target resume.”

AI assistance should normally select, reorder, or override Profile content. Editing Library truth is a distinct action and should remain explicit.

### 2.3 Human and AI clients share the same application services

The Web UI must call the same REST/application contracts as MCP. A Web-only mutation path is not canonical.

### 2.4 External side effects and persistence are separate but reconciled

A successful click on a recruiting site and a durable Job Harness record are two distinct side effects. The executor must not claim success until it has either:

- persisted the corresponding `ApplicationSubmission`, or
- durably recorded an outbox/intention that will retry that persistence.

### 2.5 Prompts are policy hints, not integrity constraints

Prompts/Skills may instruct an AI to load context and call tools in a particular order, but correctness must be enforced by tool contracts, idempotency, application invariants, durable intents, and reconciliation.

## 3. JH-R011 — High-volume Applications workspace

### Current problem

Board view currently fetches at most 200 Application board items and renders all returned cards in each lane. The lane body has no independent vertical scroll. At large scale the page becomes extremely tall, and records beyond the board query limit are not visible in Board mode.

Table view already provides server pagination and remains the dense/query-oriented view.

### Target UX

Desktop Board should behave like an operations console:

- page shell occupies the remaining viewport below the app header;
- Saved Views + filters remain above the board;
- board itself scrolls horizontally when needed;
- each application lane has a fixed available height and independently scrollable card body;
- lane header remains visible while its cards scroll;
- each lane shows the real total count, not only the count of currently loaded rows;
- a lane loads additional records without forcing other lanes to reload;
- opening a record continues to use the side panel and must not reset lane scroll state when avoidable.

### Query contract

Introduce a lane page projection rather than pretending one global page can power a large Kanban board.

Recommended contract:

```ts
ApplicationLanePage {
  stage: ApplicationStage
  items: ApplicationBoardItem[]
  total: number
  nextCursor: string | null
}
```

Cursor ordering:

```text
(stageEnteredAt DESC, applicationId DESC)
```

The cursor is opaque at REST/MCP boundaries.

Initial request can return all visible main lanes with 30–50 cards per lane. Subsequent “load more” requests target one stage.

### Performance

- cursor pagination before virtualization;
- add list virtualization only when lane card counts make it useful;
- keep Table view at explicit server pagination;
- no “load every Application into the browser” shortcut.

### Acceptance criteria

- Board never silently truncates at 200 total Applications;
- 1,000+ Applications remain operational without document-length page scrolling;
- lane headers/counts remain visible;
- each lane can fetch more independently;
- Table pagination remains intact;
- filters and terminal-mode semantics still apply.

## 4. JH-R012 — Resume Content Composer

### Current problem

The migrated domain still contains the reusable content pool and per-profile selections, but Form mode only exposes a small set of Profile/basic-contact fields. Existing data such as work bullets, project presentations, project highlights, skills, summaries, and certificates is therefore only discoverable in source mode.

### Existing durable model to preserve

No schema rewrite is required for the core selection model:

```text
ResumeLibrary
  skills[]
  workExperiences[].bullets[]
  projects[].presentations[]
  projects[].highlights[]
  summaries[]
  certificates[]

ResumeProfile
  skillIds[]
  workSelections[].bulletIds[]
  projectSelections[].presentationId
  projectSelections[].highlightIds[]
  summaryIds[]
  certificateIds[]
  sectionOrder[]
  overrides[]
```

### Target UX

Form mode becomes a multi-tab editor:

1. **Profile** — name, target role, positioning, output, template, layout;
2. **Compose** — choose content from Library into Profile;
3. **Library** — edit shared reusable content explicitly;
4. **Revision** — publish/history/diff/artifacts;
5. **Source** — advanced YAML/structured source escape hatch.

Compose view should support:

- skills: selected/unselected list;
- work experiences: include experience + choose bullets;
- projects: include project + choose one presentation + choose highlights;
- certificates/summaries: selected/unselected list;
- section order;
- selected count versus available count;
- search/filter within large highlight pools;
- stable IDs displayed in advanced/debug affordances, not as the primary label.

Profile edits must update `ResumeProfile` only. Shared Library content edits remain separate.

### AI authoring projection

Add a read model that gives an AI the candidate material available for a Profile/job without asking it to infer that material from rendered HTML or conversation memory.

Proposed operation:

```text
resume_authoring_context_get(profileId, jobId?)
```

Output includes:

- target Profile and versions;
- current selected content;
- all candidate skills/work bullets/projects/presentations/highlights/summaries/certificates;
- optional Job/JD context;
- immutable identifiers required for later patch operations;
- current revision/page/artifact summary when available.

### Acceptance criteria

- all migrated bullet/highlight/presentation selection data is visible and editable without Source mode;
- save/preview preserves the existing profile selection model;
- switching Profile does not mutate Library;
- selection actions are validated against Library IDs;
- current five production profiles render equivalently before/after a no-op edit.

## 5. JH-R013 — Exact draft PDF preview

### Current problem

The Web editor preview is an HTML iframe with an A4-like pixel height. Actual pagination is produced later by the Chromium print renderer using `@page` and print-media page-break rules. Therefore the iframe cannot guarantee final page boundaries.

### Target design

Retain two preview modes:

- **Fast**: existing HTML preview for low-latency editing;
- **PDF**: exact temporary PDF rendered through the same Chromium sidecar used for immutable PDF artifacts.

Add an unsaved-draft PDF operation:

```text
POST /api/v1/resume/preview/pdf
body: { library, profile }
response: application/pdf
```

Properties:

- does not publish a Revision;
- does not persist a ResumeArtifact;
- uses the same resolver/template/Chromium print path as final PDF materialization;
- response is `no-store`;
- can be cancelled/replaced by clients when a newer draft exists.

Web preview should render PDF pages with page boundaries and show page count / zoom. PDF.js is preferred over browser-native PDF embed if it gives more deterministic multi-page layout and controls.

### Acceptance criteria

- page breaks visible in exact preview match downloaded PDF for the same draft;
- 1/2/3+ page drafts are represented as separate pages;
- no Revision/Artifact rows are created by preview;
- renderer errors surface without destroying the fast HTML preview.

## 6. JH-R014 — Explicit human mutation entry points

### Add Job

Jobs workspace gets `+ Add Job` opening a drawer/dialog. Minimum fields:

- company;
- title;
- city;
- source kind;
- source URL/external ID;
- description/JD;
- campaign/observation metadata when applicable.

Submission calls existing Job upsert application service. It must not bypass identity/duplicate rules.

### Record Application

Job detail gets `Record application` when appropriate. Dialog fields:

- applied timestamp;
- listing/channel;
- Resume Profile;
- optional published Revision;
- optional PDF Artifact;
- note.

Submission calls existing `recordApplication` use case with a generated idempotency key and actor `user`.

### Acceptance criteria

- no manual DB edits are needed for normal Job/Application capture;
- all UI writes use existing canonical REST/application contracts;
- duplicate Job handling is explicit;
- Application records link to Resume evidence when selected.

## 7. JH-R015 — Resume MCP authoring API

Career MCP already exposes durable job/application/discovery tools. Resume Builder currently exists mainly over REST. Add MCP tools so an AI can operate at semantic boundaries rather than editing YAML or the database.

Recommended V1 tools:

```text
resume_profiles_list                 read
resume_profile_get                   read
resume_authoring_context_get         read
resume_profile_patch_selection       state-write
resume_profile_patch_overrides       state-write
resume_preview_get                   read / generated output
resume_revision_publish              state-write
resume_revision_artifact_materialize state-write
```

Avoid one giant “replace entire library/profile JSON” tool as the primary AI interface. Narrow patch tools reduce accidental fact mutation.

All writes require expected versions and idempotency keys where replay is possible.

## 8. JH-R016 — ChatGPT integration

Package the integration as two layers:

### Skill/policy layer

The workflow instructs ChatGPT to:

1. load `career_context_get` before discovery/application work;
2. begin a DiscoveryRun;
3. persist discovered Jobs incrementally in small batches;
4. use duplicate identity results instead of inventing local dedupe rules;
5. after confirmed external submission, immediately record ApplicationSubmission evidence;
6. complete the DiscoveryRun and run a final reconciliation/stat check.

### MCP/App layer

Expose only explicit Job Harness tools. Do not expose SQLite/filesystem mutation.

If ChatGPT cannot directly reach a Tailnet-only endpoint, provide a narrowly scoped authenticated tunnel/proxy rather than making the whole Oracle2 service public.

The Skill improves adherence; it does not replace executor durability.

## 9. JH-R017 — SubmissionIntent / outbox / reconciliation

This is the reliability boundary for automated application submission.

### Proposed lifecycle

```text
planned
  -> external_in_progress
  -> external_confirmed
  -> persistence_pending
  -> committed

failure branches:
  external_failed
  needs_manual_review
```

A `SubmissionIntent` records enough immutable identity to recover after a browser/agent crash:

- intent ID / idempotency key;
- Job + Listing;
- selected Resume Profile/Revision/Artifact;
- executor/session identity;
- external target URL/source;
- timestamps/status;
- external confirmation evidence/reference when available;
- last persistence error / retry count.

### Durable outbox rule

Once the executor has evidence that the external application succeeded, it must durably store either:

- the final Job Harness ApplicationSubmission, or
- a `persistence_pending` intent/outbox item.

The executor cannot return “fully complete” while neither exists.

### Reconciliation

A reconciliation job periodically finds:

- external-confirmed intents without ApplicationSubmission;
- ApplicationSubmission rows that reference no active known listing when identity data says they should;
- duplicate retries using the same idempotency key;
- stale in-progress intents.

## 10. Delivery order

Implementation order is intentionally dependency-driven:

1. **R011** Applications board scalability;
2. **R012** Resume Composer;
3. **R013** exact PDF preview;
4. **R014** human Add Job / Record Application;
5. **R015** Resume MCP semantic tools;
6. **R016** ChatGPT packaging/tunnel instructions;
7. **R017** executor SubmissionIntent/outbox/reconciliation.

R011–R014 improve the product without depending on external ChatGPT capabilities. R015 exposes the same semantics to AI. R017 is mandatory before treating automatic external submission as reliably transactional.

## 11. Non-goals

This phase does not:

- replace SQLite;
- let AI mutate the database/filesystem directly;
- turn Resume into a free-form Canva-like editor;
- make prompt text a persistence mechanism;
- couple Job Harness to one LLM/vendor;
- automatically infer that an external application succeeded without executor evidence.

## 12. Definition of done for the phase

The phase is complete when:

- Applications Board remains usable with thousands of records and never silently truncates;
- Resume Form mode exposes the full migrated content-selection capability;
- exact draft preview uses the same pagination engine as PDF export;
- human users can add a Job and record an Application without external scripts;
- AI clients can read authoring context and perform controlled Resume mutations through MCP;
- discovery/application workflows are documented as tool-driven, incremental, and idempotent;
- automated external submission has a durable intent/outbox/reconciliation mechanism so a model forgetting a follow-up tool call cannot lose confirmed submission state.

## 13. Implementation evidence — 2026-09-17

The first landing tranche, **JH-R011..JH-R015**, is implemented on production Job Harness. `pnpm check` passes with **42 test files / 90 tests**, canonical OpenAPI is regenerated, TypeScript/build checks pass, and the Oracle2 `renderer` / `server` / `web` services are healthy after rebuild.

### R011 evidence

Applications Board no longer performs one global max-200 fetch. The server-rendered workspace requests each visible stage independently (40 cards per lane initially), carries the real per-stage total into the client, and each lane can fetch its next page independently. On desktop the Applications workspace occupies the available viewport, the board scrolls horizontally, and every lane card body has its own vertical scroll container with stable scrollbar/overscroll containment. The 50-row Table view remains unchanged as the dense server-paginated view. Keyset cursors remain an optional future hardening step; the silent 200-record truncation and document-length lane problem are removed now.

### R012 evidence

`/resumes` now has **Basics / Compose / Source YAML** modes. Compose operates directly on existing `ResumeProfile` selection fields and exposes the migrated Library pool: skills, work experiences + bullets, projects + presentation variants + highlights, education, certificates, summaries and section order. It changes Profile composition only; shared `ResumeLibrary` fact editing remains a separate scope. No Resume schema migration was required.

### R013 evidence

A new authenticated `POST /api/v1/resume/preview/pdf` resolves an unsaved Library/Profile draft and sends the rendered HTML through the same private Chromium renderer used by immutable PDF Artifacts. The Web proxies this as `/resume/preview/pdf` and offers **Fast** HTML versus **Exact PDF** preview. Production smoke for `ai-agent-app` returned a valid **596,679-byte `%PDF-`** document while `resume_revisions` remained **5 -> 5** and `resume_artifacts` remained **9 -> 9**, proving draft preview has no persistence side effect.

### R014 evidence

Jobs now has a `+ Add job` panel using `jobs.upsertJobsBatch`, including company/title/city/source/URL/external-ID/JD and canonical Listing identity handling. Job detail now has a Record Application form using the existing `applications.record` use case with an explicit idempotency key, actor `user`, listing/channel/time/note and Resume Profile. When requested, it attaches the latest published Revision and an already-materialized PDF Artifact if available. Neither UI path writes SQLite directly.

### R015 evidence

Production Streamable HTTP MCP now lists **24 tools**, including seven Resume tools: `resume_profiles_list`, `resume_profile_get`, `resume_authoring_context_get`, `resume_profile_patch_selection`, `resume_profile_patch_overrides`, `resume_revision_publish`, and `resume_revision_artifact_materialize`. The authoring-context smoke for `ai-agent-app` returned the canonical Profile, all **7 Library projects**, and its Revision history. Profile patch tools are explicitly advertised as non-idempotent because they use optimistic versions; reads/publish/materialization retain retry-safe protocol hints where applicable. Direct database/file mutation and external recruiting-site submission remain outside MCP.

The production data baseline after this landing remains **schema 6 / 104 Jobs / 41 Applications / 84 Companies / 41 Submissions / 5 Profiles / 5 Revisions / 9 Artifacts**.

### R017 evidence

`SubmissionIntent` is now a first-class durable boundary for external recruiting-site actions. The external browser executor must persist `planned`, mark `external_in_progress` before clicking the site, and then record either exact success evidence or explicit failure. Confirmed success reconciles into canonical `ApplicationSubmission` with idempotency key `submission-intent:<intentId>`; a local failure after site success is retained as `persistence_pending` instead of requiring the external action to be repeated.

SQLite schema **v7** owns the intent/outbox table, including executor/session, Job/Listing/Resume evidence, target URL, external timestamps/reference/evidence, retry/error state and reconciled Application/Submission IDs. The logical Career export is now schema **v3** and carries unfinished intents so recovery state is not lost in portable exports. REST and MCP expose list/get/prepare/begin/confirm/fail/reconcile plus a bounded recovery sweep; none of these tools performs the recruiting-site side effect itself.

The Server starts a guarded background reconciler (default every 5 minutes, stale threshold 2 hours, retry budget 8, batch 100). It retries only local persistence for already-confirmed intents and sends stale `external_in_progress` or over-budget work to `needs_manual_review`; it never guesses that an external submit succeeded. Automated tests also prove restart recovery and manual confirmation after stale review. Full repository verification passes **44 test files / 96 tests**, OpenAPI drift validation, TypeScript/build gates and production Next build.

Oracle2 production was rebuilt from main `21c068e`. Renderer, Server and Web are healthy. Migration preserved the existing data baseline while advancing to **schema 7**: **104 Jobs / 41 Applications / 84 Companies / 41 ApplicationSubmissions / 5 Resume Profiles / 5 Revisions / 9 Artifacts / 0 SubmissionIntents**, with zero foreign-key violations and `PRAGMA integrity_check = ok`. Authenticated production REST returned an empty intent list and a zero-work reconciliation sweep, and logical export returned schemaVersion **3** with zero intents. Production MCP exposes **32 tools**, including all eight SubmissionIntent tools and the existing Resume authoring surface.

### R016 package evidence

The ChatGPT integration is now packaged as a first-class repository integration under `integrations/chatgpt/` rather than relying on conversational memory. It includes a normative workflow policy, compact agent instructions, starter prompts, app/tool-group metadata, a credential-free Secure MCP Tunnel profile template, secret-env template, static contract/safety guard, and an authenticated MCP protocol smoke based on the official MCP SDK.

The package freezes the expected orchestration boundary: ChatGPT loads Career context before discovery, opens/completes `DiscoveryRun` around external web search, authors Resume state only through semantic Profile tools, publishes immutable Revision/Artifact evidence, and requires `SubmissionIntent.prepare -> begin` before a separate browser executor performs a real recruiting-site side effect. On reconnect/retry it checks durable intent state before launching browser work, so MCP/network loss cannot justify a duplicate external submission. The static gate proves the production catalog contains **32 tools**, all **18 required workflow tools** exist, and **0 tools** advertise external side effects or raw database/filesystem/external-submit capabilities.

The authenticated Oracle2 smoke against `http://127.0.0.1:20901/mcp` passes after the `3b6ca8e` deployment and reports **104 known Jobs / 41 Applications / 0 SubmissionIntents / 5 Resume Profiles**, with all required ChatGPT tools present. Renderer, Server and Web remain healthy. The infrastructure registry is pinned to `3b6ca8e`, and `my-infrastructure` now contains a staged dedicated Job Harness tunnel service/env/verification/provisioning package without any committed credential. A separate official `tunnel-client` **v0.0.14 ARM64** runtime was downloaded, release-checksum verified, and installed at `~/.local/bin/tunnel-client-job-harness`; the existing unrelated Oracle2 tunnel remains on its original binary and configuration.

Final R016 activation is intentionally still open because it requires an OpenAI control-plane action: provision a **dedicated** Job Harness Secure MCP Tunnel/runtime key and scan/approve the custom app in ChatGPT. Oracle2 already has an active `oracle2-tunnel.service`, but its `main` channel launches a different broad Oracle2 MCP surface; it was deliberately left untouched instead of being repointed or mixed with Job Harness. Once the dedicated tunnel ID exists, the staged profile can bind only `127.0.0.1:20901/mcp`, inject the downstream Bearer header from a private secret reference, run `tunnel-client doctor`, start the isolated user service, and then perform the ChatGPT-side tool scan.
