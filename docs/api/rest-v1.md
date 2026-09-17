# REST API v1

The REST API is a thin transport adapter over the same Job Harness application/workspace ports used by MCP. Routes do not own dedupe, lifecycle, idempotency, or persistence rules.

Base path:

```text
/api/v1
```

When `JOB_HARNESS_AUTH_TOKEN` is configured, every `/api/v1/*` request and `/mcp` request requires:

```http
Authorization: Bearer <token>
```

`/healthz` remains unauthenticated for service health checks.


## Machine-readable contract

The repository publishes a generated OpenAPI 3.1 projection at `openapi/job-harness-v1.json`. The running server exposes the same generated document at `GET /openapi.json`; this endpoint is intentionally outside the bearer-protected `/api/v1/*` boundary so trusted build/codegen consumers can fetch the contract without receiving a Career data credential. The current deployment is Tailnet-only, so the document is not a public-Internet discovery surface.

The artifact is generated directly from the canonical Zod request/response schemas and the versioned REST route registry. `pnpm check:openapi` fails on drift; do not hand-edit the JSON artifact.

## Read routes

| Method | Route | Application contract |
| --- | --- | --- |
| GET | `/analytics` | `workspace.getAnalyticsSnapshot` |
| GET | `/pipeline` | `analytics.getPipelineStats` |
| GET | `/export` | consistent logical Career JSON snapshot |
| GET | `/backup` | consistent SQLite backup |
| GET | `/dashboard` | `workspace.getDashboardSnapshot` |
| GET | `/companies` | `workspace.listCompanies` |
| GET | `/companies/:companyId` | `workspace.getCompanyDetail` |
| GET | `/jobs` | `workspace.searchJobListItems` |
| GET | `/jobs/:jobId` | `workspace.getJobDetail` |
| GET | `/applications` | `workspace.listApplicationBoard` |
| GET | `/applications/:applicationId` | `workspace.getApplicationWorkspaceDetail` |
| GET | `/submission-intents` | `submissionIntents.list` |
| GET | `/submission-intents/:intentId` | `submissionIntents.get` |
| GET | `/campaigns` | `campaigns.listCampaigns` |
| GET | `/campaigns/:campaignId` | `campaigns.getCampaign` |
| GET | `/resumes` | `workspace.listResumeUsage` |
| GET | `/saved-views` | `savedViews.listSavedViews` |
| POST | `/saved-views` | `savedViews.upsertSavedView` |
| DELETE | `/saved-views/:savedViewId` | `savedViews.deleteSavedView` |
| GET | `/discovery` | `workspace.listDiscoveryRuns` |
| GET | `/discovery/:runId` | `workspace.getDiscoveryRunDetail` |

Jobs query parameters currently map to durable filters: `limit`, `offset`, `company`, `title`, `city`, repeated/comma-separated `states`, repeated/comma-separated `sourceKinds`, `applied`, and `campaignId`.

Saved Views support pagination plus optional `workspace=jobs|applications`. Definitions are strict typed contracts; transient page offsets and selected side-panel IDs are not valid fields.

Applications support `limit`, `offset`, repeated/comma-separated `stages`, `company`, `campaignId`, `resumeProfileId`, `appliedFrom`, `appliedTo`, and `terminal=exclude|include|only`. Companies support pagination plus `query` and optional `campaignId`. Analytics and Pipeline stats support optional `campaignId`. Discovery history supports pagination plus optional `campaignId` and `executor`. Dashboard accepts `campaignId`, `recentDiscoveryLimit`, and `attentionLimit`.
SubmissionIntent list filters support `statuses`, `jobId`, `updatedBefore`, `order=newest|oldest`, `limit`, and `offset`. The durable lifecycle is `planned -> external_in_progress -> external_confirmed -> committed`, with `persistence_pending`, `external_failed`, and `needs_manual_review` recovery branches.


## Write routes

| Method | Route | Application command |
| --- | --- | --- |
| POST | `/jobs/batch` | `jobs.upsertJobsBatch` |
| PATCH | `/jobs/:jobId/state` | `jobs.setJobState` |
| POST | `/applications` | `applications.recordApplication` |
| POST | `/applications/:applicationId/transition` | `applications.transitionApplication` |
| POST | `/submission-intents` | `submissionIntents.prepare` |
| POST | `/submission-intents/:intentId/begin` | `submissionIntents.begin` |
| POST | `/submission-intents/:intentId/confirm` | `submissionIntents.confirm` |
| POST | `/submission-intents/:intentId/fail` | `submissionIntents.fail` |
| POST | `/submission-intents/:intentId/reconcile` | `submissionIntents.reconcile` |
| POST | `/submission-intents/reconcile-pending` | `submissionIntents.reconcilePending` |
| PUT | `/campaigns/:campaignId` | `campaigns.upsertCampaign` |
| POST | `/discovery` | `discovery.beginDiscoveryRun` |
| POST | `/discovery/:runId/complete` | `discovery.completeDiscoveryRun` |

Every Agent/user retry-sensitive write keeps the canonical idempotency requirements from the application contract. REST never performs an external job application. `SubmissionIntent` routes only persist intent/evidence and reconcile confirmed external success into local `ApplicationSubmission` state. The batch reconciliation route never clicks a recruiting site; it retries local persistence and moves stale/over-retried work to manual review.

## Errors

Errors use a stable JSON envelope:

```json
{
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "Invalid application stage transition: screening -> applied"
  }
}
```

HTTP mapping:

- malformed/runtime-invalid input -> `400 VALIDATION_ERROR`;
- missing entity -> `404 NOT_FOUND`;
- business/idempotency conflict -> `409`;
- invalid lifecycle transition -> `422 INVALID_TRANSITION`;
- unexpected server failure -> `500 INTERNAL_ERROR` with no persistence/internal detail in the response.

## Transport invariant

```text
REST / MCP / future Web server action
            ↓
   CareerApplicationPorts
   CareerWorkspaceReadPort
            ↓
      domain + storage
```

No route imports SQLite tables or reimplements state transitions.
