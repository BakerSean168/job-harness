# MemoFlow integration boundary

Status: **CH-0004 contract frozen; runtime adapter not implemented**.

Job Harness is an independent system. MemoFlow may consume it as an optional first-party integration, but Job Harness remains fully usable without MemoFlow.

## Production evidence that unlocked CH-0004

The integration contract was intentionally deferred until standalone usage was proven. On 2026-09-16 the standalone system completed that gate on Oracle2:

- durable Docker/Compose deployment on Tailnet `20900` / `20901`;
- real state: 104 Jobs, 41 Applications, 5 Resume profiles;
- restart/persistence and official-SDK MCP verification;
- REST/MCP bearer boundary verified from a second Tailnet peer;
- JobSync reconciliation: 66/66 legacy Jobs resolved, 37/37 applied records mapped, 0 unresolved;
- Oracle2 runtime backup v5 restore drill, including all Resume artifacts and SHA-256 verification;
- JobSync retired only after the above checks passed.

This is sufficient evidence to freeze the host boundary. It is **not** evidence for a generic dynamic plugin SDK.

## Dependency direction

```text
MemoFlow Host
    -> Career integration adapter
    -> @job-harness/client CareerGateway
    -> versioned Job Harness REST API
    -> Career application/workspace ports
```

The reverse dependency is forbidden:

```text
Job Harness core
    -X-> @memoflow/*

MemoFlow adapter
    -X-> Job Harness SQLite / persistence package
```

MCP remains an independent Agent-facing transport. The first-party host gateway uses the typed REST client so product integration does not depend on MCP session semantics.

## CareerGateway V1

`@job-harness/client` exports the narrow `CareerGateway` capability:

```text
getCampaign
getCampaignProgress
searchJobs
upsertJobs
getApplication
listApplications
recordApplication
transitionApplication
requestDiscovery
completeDiscovery
```

The gateway is implemented by `createCareerGateway(createJobHarnessRestClient(...))`. It exposes no database handle, Express object, MCP runtime, arbitrary service resolver, or MemoFlow type.

REST v1 now has transport parity for the host-critical operations that already existed in the application/MCP surface:

- `GET /api/v1/pipeline?campaignId=...`;
- `POST /api/v1/discovery`;
- `POST /api/v1/discovery/:runId/complete`.

Discovery begin is idempotent through the canonical `idempotencyKey`; `memoflow-ai` is already a canonical Discovery executor value.

## IntegrationBinding V1

`@job-harness/contracts` exports `CareerIntegrationBindingSchema` only so both systems agree on the value shape:

```text
identityId
hostKind: goal
hostId
extensionId: career
resourceKind: campaign
resourceId
status: active | paused | detached
createdAt
updatedAt
```

Ownership is explicit:

- the **host integration layer** owns this binding truth;
- Job Harness owns Campaign truth;
- MemoFlow Goal owns Goal truth;
- Job Harness must not persist this binding in Career tables;
- no cross-database foreign key is allowed;
- V1 is intentionally Goal -> Campaign only. A second real external resource type is required before generalizing this into a universal extension binding.

## Cross-repository contract distribution

CH-0004 originally proved the typed in-repo `CareerGateway`, but the package itself is intentionally private/workspace-local. Cross-repository integration therefore does **not** depend on publishing the entire Job Harness monorepo as npm packages.

The stable boundary is now:

```text
canonical Job Harness Zod schemas
        -> generated OpenAPI 3.1
        -> openapi/job-harness-v1.json
        -> GET /openapi.json
        -> MemoFlow integration codegen/adapter
```

This preserves the same boundary-first rule already used by MemoFlow: schema is truth, OpenAPI is a transport projection, and the host may generate a local client without copying Career DTOs by hand. `pnpm check:openapi` guards artifact drift.

## MemoFlow seams verified read-only on 2026-09-16

The current MemoFlow repository already exposes the boundaries needed for the next ticket:

- `GoalApplicationPort` for Goal-owned commands/queries;
- `TaskApplicationPort` for Task-owned commands/queries;
- `ScheduledHandlerRegistry`, a feature-neutral handler registry with payload validation/versioning;
- module runtime-contribution lifecycle (`start`/`stop`);
- Mastra as the single AI runtime.

The AI product-tool assembly is currently static (`createMemoFlowProductTools(deps)`), so CH-0005 must design the **smallest real Career tool-contribution seam** rather than inventing a dynamic marketplace/plugin loader.

## Ownership

- Job / Company / Application / Campaign / DiscoveryRun: Job Harness.
- Goal / Key Result: MemoFlow Goal.
- Task: MemoFlow Task.
- Time rule / durable invocation: MemoFlow Schedule + Scheduler.
- AI thread/run: MemoFlow Mastra when integrated.
- Resume content: Resume project.
- Knowledge Markdown: Thought Forest.

Integration uses stable references/IDs and public APIs, never shared database sessions or cross-database foreign keys.

## Next ticket — CH-0005

Define the first **real host contribution seams** from the verified MemoFlow codebase:

1. Goal metric provider consuming `CareerGateway.getCampaignProgress`;
2. Scheduler registration for `career.discovery.run`;
3. TaskSuggestion value + explicit conversion through `TaskApplicationPort`;
4. minimal Mastra Career-tool contribution compatible with the existing static product-tool assembly.

Do not implement a dynamic plugin loader, marketplace, universal `PluginContext`, or generic Service Locator as part of CH-0005.
