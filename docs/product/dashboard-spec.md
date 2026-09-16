# Dashboard specification

## Purpose

The dashboard answers four questions in one screen:

1. What is my active search target?
2. What changed recently?
3. What needs attention now?
4. Is the funnel improving, and which sources/resumes are working?

It is not a vanity-chart page.

## Top context

Show the active Campaign first:

```text
AI Agent / AI Fullstack
Hangzhou > Shenzhen > Shanghai
2026 graduate · 0-1y
[Open campaign]
```

If there are multiple active campaigns, provide a selector plus an “All campaigns” aggregate.

## KPI row

Recommended initial cards:

| Metric | Meaning | Click target |
| --- | --- | --- |
| Known Jobs | Durable opportunities in scope | filtered Jobs |
| Inbox | Untriaged recent discoveries | Inbox |
| Shortlisted | Jobs currently worth pursuing | Jobs: shortlisted |
| Applications | Submitted applications | Applications |
| Active Pipeline | Non-terminal applications | Applications: active |
| Interviews | Current/future interview rounds once V1.1 exists | Applications/Interviews |

Avoid “success rate” until its denominator and time window are explicit.

## Funnel

```text
Discovered -> Shortlisted -> Applied -> Screening -> Assessment -> Interview -> Offer
```

Display absolute counts first. Conversion percentages may appear between stages when meaningful. Closed/ignored/rejected/withdrawn are exits, not main funnel columns.

Clicking a stage opens the corresponding filtered workspace.

## Needs attention

This is the most operational panel.

Initial rule-based projections:

- active application with no event for N days;
- shortlisted Job not applied after N days;
- listing observed closed while application is still active;
- Campaign with no successful DiscoveryRun recently;
- failed/rejected DiscoveryRun;
- Resume reference whose artifact is stale/missing.

Rules should be deterministic and explainable. Do not hide an LLM recommendation behind the same visual treatment.

## Weekly activity

Show:

- jobs observed;
- new opportunities inserted;
- shortlisted;
- applications recorded;
- responses/stage changes;
- interviews scheduled (V1.1).

A small time series is useful; a GitHub-style heatmap is optional later.

## Source performance

Per `JobListing.sourceKind` / acquisition source:

```text
Official   22 applications -> 5 screening -> 2 interview
BOSS        8 applications -> 1 screening
Zhilian     6 applications -> 0 screening
Email       5 applications -> 2 screening
```

Do not treat “where discovered” and “where applied” as identical when they differ; the data model should preserve both eventually.

## Resume performance

Per `ResumeProfileRef` / actual ApplicationMaterial when available:

```text
AI Agent / ForgeFlow
17 applications
5 screening
1 interview
```

This is a correlation view, not a causal claim that the resume caused the outcome.

## Discovery activity

Latest external discovery runs:

```text
ChatGPT Web · Today 14:32
Campaign: AI Agent Hangzhou
Candidates 31 · New 8 · Duplicates 19 · Rejected 4
```

Click opens run detail with context snapshot and affected jobs.

## Empty/loading/error states

- No data: guide to import legacy data or create a campaign; do not show zeros without context.
- No active campaign: show global pipeline and a callout to create/activate a campaign.
- MCP/Agent absent: Dashboard remains fully useful; external AI is optional.
- Projection failure: show last successful refresh and retry, without hiding persisted Jobs/Applications.
## W301 implementation notes

The first operational implementation keeps these rules explicit:

- stale active Application: no new ApplicationEvent for more than 7 days;
- shortlisted but unapplied: Opportunity has been known for more than 3 days (there is not yet a separate JobDecision event timestamp);
- closed Listing while an Application remains in an active pre-offer stage: critical attention;
- active Campaign without a completed DiscoveryRun for more than 3 days: informational attention;
- Resume artifact missing: warning; Resume registry entry older than 30 days: informational attention;
- Active Pipeline excludes Offer, Rejected and Withdrawn because they are terminal in the current lifecycle;
- weekly aggregation currently uses UTC calendar boundaries;
- historical Shortlisted counts are returned as unavailable rather than inferred from current Job state/updated timestamps;
- source performance groups by associated JobListing.sourceKind. A multi-source Opportunity may appear in multiple rows, and the view does not claim which channel actually received the application;
- failed DiscoveryRun attention remains deferred because DiscoveryRun does not yet own a success/failure outcome field.

These are deterministic product rules, not LLM recommendations.
