# Saved Views

Saved Views persist reusable workspace filters in Job Harness instead of relying on browser `localStorage` or bookmarking arbitrary URLs.

## Scope

Web V1 supports two typed workspaces:

```text
Jobs
  company
  title
  city
  state
  source
  applied / not applied
  campaign

Applications
  company
  stage
  campaign
  resume profile
  applied-from / applied-to
  terminal mode
  board / table view
```

Transient navigation state is deliberately excluded:

- pagination offset;
- selected Job/Application side-panel IDs;
- one-off query parameters that are not part of the canonical workspace contract.

Applying a Saved View therefore starts from the first page and does not reopen a stale side panel.

## Persistence and identity

Saved Views are durable SQLite state (`saved_views`, introduced in schema v3; current schema is v4), not browser-local state.

Each record has:

```text
id
workspace: jobs | applications
name
strict typed definition
createdAt
updatedAt
```

Names are unique case-insensitively within one workspace. The same display name may exist once in Jobs and once in Applications.

Create, overwrite and delete operations flow through:

```text
Web Server Action
  -> typed REST client
  -> /api/v1/saved-views
  -> CareerSavedViewsPort
  -> SQLite
```

The Web UI cannot bypass the typed definition schema. Unknown fields such as `offset` are rejected.

## Export / backup behavior

Saved Views are UI/workflow preferences rather than Career-domain business truth, so the W402 logical Career JSON export intentionally does not include them.

The physical SQLite backup contains the `saved_views` table and is the source of truth for full disaster recovery, including Saved Views.
