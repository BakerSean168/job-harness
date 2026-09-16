# Open-source product benchmark

Reviewed: 2026-09-16

## Decision

Job Harness should not copy one product wholesale. The target UX is a deliberate composition:

- **Opportunity semantics:** Muatasim-Aswad/job-tracker
- **Career-domain completeness check:** CareerPulse + JobSync
- **Primary workspace interaction:** Twenty
- **Triage / display controls / dense work management:** Plane
- **Resume registry presentation:** Reactive Resume
- **Simple application-board ergonomics:** hmwheele/job-tracker + letanure/JobTracker

The differentiator is Job Harness's own MCP/application-port boundary and external-brain model: ChatGPT or another Agent searches and reasons; Job Harness persists facts and exposes safe tools.

## Primary references

| Project | Patterns to borrow | Patterns not to copy |
| --- | --- | --- |
| `Muatasim-Aswad/job-tracker` | One durable opportunity across multiple listing URLs; history attached to the opportunity; listing capture; decisions/materials/timeline; Kanban visibility | Its specific implementation/runtime and any private-overlay assumptions |
| `tcpsyn/CareerPulse` | Comprehensive domain checklist: job discovery, dedupe, application events, interview rounds, contacts, calendar, response tracking, analytics | Built-in scraping fleet, embedded AI provider stack, resume generation, auto-fill/follow-up automation as core ownership |
| `Gsync/jobsync` | Dashboard summary, jobs/application tracking, resume registry, contacts, MCP exposure, recent activity | Built-in AI provider configuration, generic Tasks/Activities as first-class Job Harness domains, company-board automation as core |
| `twentyhq/twenty` | Sidebar workspace shell, global search/command menu, Table/Kanban/Calendar views, filters/sorts, saved views, right side-panel detail, record pages | Generic user-defined CRM schema in V1; copying AGPL application code |
| `makeplane/plane` | Triage mindset, dense board/table display options, grouping, saved views, analytics, quick issue detail patterns | Project/sprint/module concepts that do not map to job search; copying AGPL code |
| `reactive-resume/reactive-resume` | Resume cards, preview/export affordances, multi-language discipline, self-hosted/private UX | Resume authoring/editor ownership; Job Harness only keeps references to Resume Harness artifacts |
| `hmwheele/job-tracker` | Compact application cards, customizable-looking pipeline ergonomics, next interview/call visibility, schedule history | Browser-only persistence and a single Job=Application model |
| `letanure/JobTracker` | Jobs table + application board + contacts + calendar + notes as a sanity-check for full search workflow | Rebuilding its generic Task board, CV builder, or localStorage architecture |

## Secondary references

`Wirtzer/linkedin-dashboard-standalone` is useful for checking Contacts, Interviews, Outreach, and pipeline coverage. `uxdesignlab/job-search-terminal` validates the usefulness of resume lanes and local-first funnel management. `AkhilDhawan22/job-track-os` validates a key Harness principle: an Agent should be able to read and mutate the job-search state through a narrow structured interface rather than forcing the state system itself to become the AI brain.

These are evidence sources, not product templates.

## Product decisions derived from the benchmark

### 1. Opportunity and listing are different objects

A persistent `Job`/Opportunity represents the real-world opportunity. A `JobListing` represents one publication of that opportunity on BOSS, an official ATS, an email link, Moka, Greenhouse, etc.

This supersedes the current V0.1 shortcut where `Job` directly owns a canonical URL and a flat `sources[]` array.

### 2. Jobs default to Table; Applications default to Board

The job corpus is a research/triage dataset and benefits from a CRM-style dense table. The application pipeline is a state machine and benefits from Kanban.

Do not force one view type onto both concepts.

### 3. Inbox is a real product concept, not a Job state

Agent-discovered candidates need a review queue before the human considers them part of the active shortlist. Inbox/Triage is a **view/projection over recently discovered unreviewed opportunities**, not another persistent lifecycle enum.

### 4. Side panel before full-page navigation

Clicking a row/card should open a right-side detail panel for rapid review. A full record page remains available for deep detail.

### 5. Timeline is the audit truth

Application current stage is a projection. `ApplicationEvent` is the authoritative history. Interview scheduling, stage changes and user/Agent notes must remain auditable.

### 6. Contacts and Interviews are legitimate domains, but not Web V1 blockers

CareerPulse, JobSync, LinkedIn Dashboard and other trackers repeatedly model recruiters/interviewers and interview rounds. Reserve clean domain boundaries now, but implement them after the Jobs/Application primary slice is proven.

### 7. Do not rebuild Task/Schedule/AI/Resume authoring

Many trackers become broad career suites. Job Harness intentionally avoids that ownership:

- next actions may be stored/suggested, but durable Tasks belong to a future host such as MemoFlow;
- interview timestamps may be recorded, but recurring scheduling belongs to a future host scheduler;
- AI assessments are externally produced snapshots, not an embedded provider/runtime;
- resumes are referenced from Resume Harness, not authored here.

## License / implementation guard

Job Harness is MIT. Product concepts, information architecture and interaction patterns may be learned from references, but source code is not copied.

In particular, Twenty and Plane are primarily AGPL-licensed applications. Their UI behavior is used only as design inspiration unless a specifically permissive package is separately evaluated and intentionally adopted.

## Source index

- https://github.com/Muatasim-Aswad/job-tracker
- https://github.com/tcpsyn/CareerPulse
- https://github.com/Gsync/jobsync
- https://github.com/twentyhq/twenty
- https://github.com/makeplane/plane
- https://github.com/reactive-resume/reactive-resume
- https://github.com/hmwheele/job-tracker
- https://github.com/letanure/JobTracker
- https://github.com/Wirtzer/linkedin-dashboard-standalone
- https://github.com/uxdesignlab/job-search-terminal
- https://github.com/AkhilDhawan22/job-track-os
