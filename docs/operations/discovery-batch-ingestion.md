# Discovery batches: caller contract and verification

Status: active. Contract source of truth: `UpsertJobsBatchInputSchema` in
`packages/contracts/src/operations.ts`; generated REST OpenAPI and MCP contracts
derive from that schema. This guide cannot override the schema.

## Verify before writing

1. Collect from the preferred channels: verified resume-receiving email,
   employer site/ATS, then job boards. A source labelled `email` must actually
   contain a supported resume-receiving address; a careers URL alone is not email evidence.
2. Select only relevant work: frontend, fullstack, AI application/Agent engineering,
   **technical AI product manager / AI Agent product manager**, or product engineer.
   Exclude pure sales/business-development roles and company blocklist matches.
   **Do not impose an aggregate cap on 1-3 year experience listings.**
3. Do not submit jobs already applied to or contacted. Search and check outreach
   evidence separately; `applied:false` alone is not enough.
4. Treat a historical listing as `status: unknown` unless its availability was
   independently observed in this run. Browser security challenges are *not*
   evidence of a job being open or closed.
5. Prefer `identityKind: external-id` with a stable source namespace + ID, or
   `identityKind: url` for a **job-specific** stable URL. Use `scoped` when
   there is only a shared careers page; it is a source, not a unique job identity.
6. Run `pnpm jobs:batch:validate /path/to/batch.json` before invoking
   `career_jobs_upsert_batch` or `POST /api/v1/jobs/batch`.
   This tool is read-only. It validates 1-100 jobs and reports field paths,
   e.g. `jobs[0].listings[0].url`. A passing result is **not** a live-site check.
7. Submit bounded batches and examine *each item* in the response.
   `inserted`, `updated`, `duplicate` and `rejected` are distinct outcomes.
   Neither `updated` nor `duplicate` means a new opportunity was discovered.
   A rejected candidate with `ambiguous-scoped-identity` needs a stronger
   job-specific identity or manual inspection. Do not retry it with a fake ID.
8. Count only independently verified, eligible, unique, non-contacted,
   currently-open opportunities toward the requested target. Finishing a
   `DiscoveryRun` does not itself prove that a target such as 100 was achieved.

## Minimal valid batch (illustrative only)

```json
{
  "jobs": [
    {
      "companyName": "Example AI",
      "title": "Technical AI Product Manager",
      "city": "Hangzhou",
      "observedAt": "2026-10-19T10:00:00Z",
      "listings": [
        {
          "sourceKind": "official",
          "identityKind": "url",
          "url": "https://example.com/jobs/product-engineer",
          "status": "unknown",
          "verificationKind": "observed"
        }
      ]
    }
  ]
}
```

For confirmed opening, use `verificationKind: open_confirmed`,
`status: active`, and provide `evidenceUrl` or `verificationNote`
that genuinely supports the open observation. A `200 OK` page with
`Security Verification` is not sufficient.

## Error triage

- REST Zod validation returns HTTP 400 `VALIDATION_ERROR` with an `issues`
  array; use its paths, not a guess based on payload size.
- MCP transport `INVALID_ARGUMENT` is not proof of a particular invalid
  field; first reproduce with the local schema validator, then inspect
  server-side logs only if the payload passes.
- Platform-side safety blocks do not prove that the Job Harness server was
  called. Record a separate blocked batch, not rejected job observations.
- Scoped-only duplicate candidates with the same normalized
  company/title/city now return `rejected` with
  `ambiguous-scoped-identity`; they do not create another Job. Distinct
  verified job-specific URL/external-ID identities continue to be independent.
- Resuming after failure must reuse actual job IDs and evidence; do not
  synthesize `observedAt` as if a historical search result had just been
  reconfirmed live. Do not set `open_confirmed` without genuine proof.

## Zhilian runtime ownership

The Job Harness `vvvsrx/get_jobs` adapter is a pinned external browser
candidate (Playwright + Camoufox) running locally under WSL/WSLg in
collect-only mode. It is **not** the same as `loks666/get_jobs` and is
not a Python `requests.get` scraper. Upstream `vvvsrx/get_jobs` has
declared itself unmaintained (last pinned commit `ec3c81c`, 2026-08-24).
A GCP-hosted plain HTTP response titled `Security Verification` does
not measure the WSL browser runtime. Its site canary requires a user-started
local runtime and a legitimately authenticated browser; do not auto-start
the user's browser or bypass CAPTCHA/verification. Compare current selectors
against visible page behavior before proposing local overlay changes.
