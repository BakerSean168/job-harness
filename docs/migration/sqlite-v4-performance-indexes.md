# SQLite v4 — workspace performance indexes

Schema v4 is a non-destructive performance migration.

It runs after the v2 JobListing and v3 Saved Views migrations and only creates `IF NOT EXISTS` indexes for the active Jobs, Applications, Discovery and Campaign-membership read paths. No Career-domain rows are rewritten.

Opening an older database through `SqliteCareerStore` migrates sequentially to v4 and then sets:

```sql
PRAGMA user_version = 4;
```

See [Pagination and workspace query performance](../performance/pagination.md) for the index list and rationale.
