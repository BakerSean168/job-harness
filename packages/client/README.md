# @job-harness/client

Host-neutral typed REST client for Job Harness.

It consumes canonical `@job-harness/contracts`, validates every successful response at runtime, preserves stable server error envelopes through `JobHarnessRestError`, and accepts an injected `fetch` implementation / bearer token.

The package contains no browser credential storage and no persistence imports. In the Web app it is instantiated only from server-side code so `JOB_HARNESS_AUTH_TOKEN` never becomes a `NEXT_PUBLIC_*` value or serialized client prop.

Current surfaces cover the Web V1 REST routes:

- Job workspace list/detail + state changes + batch upsert;
- Application board/detail + record/transition, including Campaign/Resume/date/outcome filters;
- Dashboard, Analytics, Company list/detail, Resume usage, paginated Discovery history/detail;
- Campaign list/get/upsert.
