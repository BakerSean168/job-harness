# @job-harness/web

Next.js App Router workspace for Job Harness.

Current slice: **W201 Inbox + Jobs workspace**.

Implemented foundation:

- persistent Twenty/Plane-inspired sidebar workspace shell;
- stable top-level routes matching the frozen information architecture;
- `zh-CN` default + `en` cookie-based locale catalogs;
- light/dark semantic design tokens with system fallback and local preference;
- reusable WorkspaceHeader, EmptyState, LoadingState, InlineError primitives;
- localized loading/error/not-found surfaces;
- production build as part of the repository quality gate.

W201 now connects `/jobs`, `/inbox`, and `/jobs/:jobId` to live Job Harness data through `@job-harness/client`:

- dense Jobs Table + server-side filters and pagination;
- Inbox as the `discovered` triage projection (no duplicate Inbox lifecycle state);
- URL-addressable right-side Job detail panel plus full detail deep link;
- Listing/Application/Timeline/Observation detail sections;
- shortlist / ignore / close / rediscover actions through Next Server Actions;
- bearer token remains server-only.

Applications Board remains W202. Other navigation items deliberately stay as placeholders until their own vertical slices land.

Run locally:

```bash
pnpm web
```

The Web process is independent from `@job-harness/server`; the latter owns `/api/v1` and `/mcp`.


Server-side Web configuration:

```bash
JOB_HARNESS_API_URL=http://127.0.0.1:3000/api/v1
JOB_HARNESS_AUTH_TOKEN=... # only when the standalone server requires it
```

Never expose `JOB_HARNESS_AUTH_TOKEN` with a `NEXT_PUBLIC_` prefix.
