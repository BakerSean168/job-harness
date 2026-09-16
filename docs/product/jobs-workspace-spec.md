# Jobs workspace specification

## Default mode: dense table

Jobs are a corpus to research, dedupe, triage and filter. The default should be a high-density Table rather than a Kanban board.

Recommended default columns:

1. Company
2. Role
3. Location
4. Job state
5. Application stage (if any)
6. Source/listing summary
7. Campaign
8. Resume lane / recommended or used resume when available
9. First seen
10. Last seen

Optional columns:

- work mode;
- salary;
- eligibility/assessment;
- number of listings;
- closing date;
- tags/signals.

## Filters

Core filters:

- company;
- title/text search;
- city/location;
- Job state;
- Application presence/stage;
- listing source kind;
- campaign;
- first/last seen range;
- resume profile;
- eligibility/assessment when V1.1 lands.

Filters should be additive and visible as removable chips. Advanced filter-builder can come later.

## Sorting

System sorts:

- Last Seen (default for discovery work)
- First Seen
- Company
- Role
- Application date
- Pipeline stage

Do not make an opaque AI score the default sort.

## Inbox/Triage mode

Inbox reuses the same underlying Job table/query but optimizes actions:

```text
[Shortlist] [Ignore] [Close] [Open source]
```

Keyboard navigation should be possible later. Batch selection/actions are valuable once the individual workflow is proven.

## Side-panel detail

Opening a Job should preserve current list position/filter.

### Header

- Company + role
- location
- current Job state
- current Application stage if any
- primary listing/source
- quick actions: Open source, Shortlist/Ignore, Record Application, More

### Tabs / sections

**Overview**
- description/JD;
- role/location/work mode/salary if known;
- first/last seen;
- campaign memberships;
- assessment snapshot if present.

**Listings**
- each JobListing source, URL, external ID, active/closed/unknown, first/last seen;
- open original;
- mark listing stale/closed when explicitly known.

**Application**
- current application stage;
- applied date;
- resume used;
- latest action/event.

**Timeline**
- Job observations;
- triage decisions;
- application events;
- future interview events.

**Notes / Decisions** (V1.1 structured model)
- human/Agent note provenance;
- reasons for shortlist/ignore/close.

## Full record page

Use the same sections as side panel but with more space. No separate UI model; side panel and full page consume the same read model.

## Job creation

Manual Add Job should accept minimal data:

- company;
- role;
- source/listing URL;
- optional location/description.

The same canonical service used by MCP must perform dedupe. UI may not bypass the identity rules.
