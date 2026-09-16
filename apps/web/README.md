# @job-harness/web

Next.js App Router workspace for Job Harness.

Current slice: **W102 Web shell + i18n**.

Implemented foundation:

- persistent Twenty/Plane-inspired sidebar workspace shell;
- stable top-level routes matching the frozen information architecture;
- `zh-CN` default + `en` cookie-based locale catalogs;
- light/dark semantic design tokens with system fallback and local preference;
- reusable WorkspaceHeader, EmptyState, LoadingState, InlineError primitives;
- localized loading/error/not-found surfaces;
- production build as part of the repository quality gate.

The shell intentionally shows placeholders only. Jobs/Application business screens begin in W201/W202 and consume `/api/v1` through a typed client rather than importing SQLite or server modules.

Run locally:

```bash
pnpm web
```

The Web process is independent from `@job-harness/server`; the latter owns `/api/v1` and `/mcp`.
