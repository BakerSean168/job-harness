# Product domain map

## Ownership rule

> Domain owns truth. Views project truth. Extensions contribute capabilities. AI consumes tools.

A UI page does not create a new domain. A dashboard metric is a projection, not a second source of truth.

## Web V1 core domains

| Domain | Owns | Identity / invariant |
| --- | --- | --- |
| `Company` | Canonical employer identity, aliases, website metadata | Company aliases may normalize to one company; never infer same-company solely from a similar display name |
| `Job` (Opportunity) | One durable real-world opportunity, role/title/location, triage state, description snapshot | One opportunity may have many listings; Job state is not Application stage |
| `JobListing` | A publication of a Job on one source/ATS/platform | Prefer source + external listing ID; then normalized URL. A listing URL is not the Opportunity identity |
| `JobObservation` | Evidence that an external discovery run or user observed a listing/job at a point in time | Append-oriented observation history; does not clone the Job |
| `JobSearchCampaign` | Search intent/constraints such as target roles, cities, graduation year and resume lanes | Standalone Career object; no MemoFlow Goal foreign key |
| `DiscoveryRun` | One external discovery execution and its counts/context | Search engine/Agent is external; run records what happened |
| `Application` | One hiring pipeline for a Job/cycle | V1 keeps one pipeline per job; independently evidenced repeat submissions are `submission_recorded` events on that pipeline |
| `ApplicationEvent` | Immutable/auditable application timeline facts | Current stage must be explainable by ordered events |
| `ResumeProfileRef` | External Resume Harness profile/artifact metadata | Job Harness never becomes the resume source-of-truth |
| `AnalyticsProjection` | Funnel/source/resume/campaign aggregates | Recomputable projection only |

## Implemented pre-UI correction: JobListing

As of v0.2, `JobListing` is the canonical source/ATS publication model. The former V0.1 `Job.canonicalUrl + externalIdentities + sources[]` shape remains only as SQLite migration evidence and is no longer the application contract.

Target:

```text
Company
  └── Job / Opportunity
        ├── JobListing (official ATS)
        │     └── JobObservation
        ├── JobListing (BOSS)
        │     └── JobObservation
        └── Application
              └── ApplicationEvent[]
```

`JobListing` minimum contract:

```text
id
jobId
sourceKind
externalId?
url
status: active | closed | unknown
firstSeenAt
lastSeenAt
publishedAt?
closedAt?
metadataSnapshot?
```

This landed before the Jobs UI, so UI read models can depend on `Job.listings[]` rather than legacy source fields.

### Opportunity dedupe must become conservative

With Listing and Opportunity separated, identity rules are:

1. `sourceKind + externalId` is a strong identity for **JobListing**, not automatically for the whole Opportunity;
2. normalized listing URL is the next Listing identity;
3. an existing Listing deterministically resolves to its owning Job;
4. `company + title + city` becomes an Opportunity **candidate match**, not an unconditional destructive merge;
5. when multiple plausible Jobs exist, create/retain a distinct Opportunity and surface a duplicate/merge suggestion rather than losing a real HC/BU/batch;
6. explicit merges must be auditable and reversible/migratable.

The V0.1 composite fallback is migration evidence only; v0.2 returns it as a non-destructive potential duplicate signal instead of auto-merging.

## V1.1 domains reserved by the product model

These are valid business concepts evidenced by multiple benchmark products, but they are not blockers for the first Web UI slice.

### Contact

Recruiter, hiring manager, interviewer, referrer or reference. Contact can relate to multiple Jobs/Applications with a role per relation.

### InterviewRound

A specific round with type, scheduled time, participants, preparation notes and outcome. It is more precise than overloading `ApplicationEvent` with all interview detail; the event timeline can reference it.

### ApplicationMaterial

Records the exact resume artifact / portfolio / cover letter / attachment used for one application. This is distinct from the current `resumeProfileId` convenience projection.

### JobAssessment

An immutable assessment snapshot produced by a human or external Agent:

```text
fitScore?
eligibility: eligible | risky | unknown | ineligible
strengths[]
risks[]
requirements[]
evidence[]
actor
model/provider?  # provenance only, not provider ownership
createdAt
```

This lets ChatGPT persist why a job was shortlisted without turning Job Harness into an AI runtime.

### Decision / Note

Structured decision history for shortlist/ignore/closed reason, plus free-form notes. Do not put every decision into an opaque `description` field.

## Explicit non-domains

The following remain external capabilities:

- general web search / browser automation;
- LLM provider/model runtime;
- generic Task management;
- recurring Schedule ownership;
- resume authoring;
- knowledge-note authoring;
- external job-application submission.

## State separation

```text
Job triage state
  discovered -> shortlisted | ignored | closed | archived

Application pipeline
  applied -> screening -> assessment -> interview -> offer
                                      └----------> rejected
  any active stage -> withdrawn
```

Inbox/Triage is not a sixth Job state. It is a query such as “recently discovered + not reviewed/decided”.
