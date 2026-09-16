# Information architecture

## Shell

Desktop-first workspace inspired by modern CRM/work-management shells:

```text
┌───────────────┬──────────────────────────────────────────────────────┐
│ Job Harness   │ Search / Command                                   │
│               ├──────────────────────────────────────────────────────┤
│ Overview      │                                                      │
│ Inbox      8  │ Current workspace                                    │
│ Jobs          │                                                      │
│ Applications  │                                                      │
│ Companies     │                                                      │
│ Campaigns     │                                                      │
│ Resumes       │                                                      │
│ Discovery     │                                                      │
│ Analytics     │                                                      │
│               │                                                      │
│ Settings      │                                                      │
└───────────────┴──────────────────────────────────────────────────────┘
```

Navigation should remain stable; feature-specific view controls live in the workspace header, not in the global sidebar.

## Route map

| Route | Primary purpose | Default view |
| --- | --- | --- |
| `/` | Active-search summary and attention queue | Dashboard |
| `/inbox` | Review Agent/import discoveries not yet triaged | Dense review table/cards |
| `/jobs` | Search, filter and compare all known opportunities | Table |
| `/jobs/:id` | Deep opportunity record | Record page |
| `/applications` | Operate the active application funnel | Kanban |
| `/applications/:id` | Application history and detail | Record page |
| `/companies` | Canonical company list and related jobs | Table |
| `/campaigns` | Search intent / target lanes | Cards/Table |
| `/resumes` | Resume Harness registry and usage metrics | Cards |
| `/discovery` | External Agent/search execution history | Run list |
| `/analytics` | Funnel, source, resume and campaign projections | Analytics |
| `/settings` | Language, MCP/API access, data/export, appearance | Settings |

V1.1 may add `/contacts` and `/interviews` only after their domains are implemented.

## Global interactions

### Search / command menu

Global search should find Company, Job title, Application and Campaign. Command menu can expose safe local actions such as Add Job, Record Application, Start Campaign, Import Data, and Copy MCP endpoint.

Do not put external application submission in the command menu.

### Side panel

Selecting a row/card opens a right-side detail panel without losing the current filter/view. The panel contains enough fields and actions for triage. “Open full page” navigates to the record route.

### Saved views

Jobs and Applications should eventually support saved combinations of:

- filters;
- sorting/grouping;
- visible columns/card fields;
- view mode.

V1 can ship named system views first, using the same internal view model so user-created views do not require a redesign.

## System views

### Inbox

Projection, not state:

```text
recently discovered
AND no explicit shortlist/ignore/close decision
```

Primary actions: Shortlist, Ignore, Close, Open source, Open detail.

### Jobs

System views:

- All Jobs
- Shortlisted
- Active / Seen recently
- Closed / Archived
- Applied
- Never Applied

### Applications

System views:

- Active Pipeline
- All Applications
- Needs Follow-up (projection)
- Terminal (Offer / Rejected / Withdrawn)

## Primary end-to-end path

```text
ChatGPT/Web search
  -> career_discovery_begin
  -> career_jobs_upsert_batch / future JobListing upsert
  -> career_discovery_complete
  -> Inbox
  -> user/Agent shortlists
  -> Applications: Record application
  -> ApplicationEvent timeline
  -> stage transition
  -> Dashboard/Analytics projection updates
```

The UI and MCP must converge on the same Application Ports; UI actions may not write persistence directly.
