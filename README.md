# Job Harness

Job Harness is a plugin-ready, AI-friendly job-search state and workflow system.

Its core responsibility is **not** to be an autonomous job-search AI. Instead, it owns durable career-search facts and exposes stable tools so external brains such as ChatGPT Web or a future MemoFlow AI host can read and update those facts safely.

## North star

> Domain owns truth. Extensions contribute capabilities. Hosts compose capabilities. AI consumes tools.

Job Harness owns:

- companies, opportunities, and source-specific job listings;
- listing observations and discovery runs;
- job-search campaigns;
- applications and application timelines;
- resume registry metadata;
- deduplication, idempotency, and search history.

It does **not** own:

- MemoFlow Goals, Tasks, Schedules, or AI runtime;
- Resume source content;
- Thought Forest knowledge content;
- a built-in general web-search agent;
- external job-application submission automation.

## Current status

**Standalone alpha.** The first end-to-end slice is runnable:

```text
Campaign
  -> DiscoveryRun
  -> batch Opportunity + JobListing upsert + conservative dedupe
  -> Resume registry
  -> Application record
  -> Application timeline transition
  -> Pipeline stats
  -> MCP query/write tools
```

The server uses SQLite schema v4 for durable state and exposes the same application/workspace semantics through MCP Streamable HTTP and a versioned `/api/v1` REST facade. The Next.js Web workspace, self-host session boundary, backup/export, Saved Views, accessibility baseline, and Docker/Compose deployment packaging are implemented. MemoFlow integration remains intentionally unimplemented.

## Repository shape

```text
job-harness/
├── apps/
│   ├── server/             # standalone REST + MCP composition root
│   └── web/                # Next.js workspace shell and future product UI
├── docs/
│   ├── architecture/
│   └── integration/
├── packages/
│   ├── contracts/          # canonical Zod DTO/operation schemas
│   ├── domain/             # career vocabulary, identity, lifecycle rules
│   ├── application/        # use cases, ports, transactions, idempotency
│   ├── persistence-sqlite/ # Node 24 SQLite adapter
│   ├── mcp/                # tool contracts + transport-neutral runtime
│   └── client/             # future host-neutral client SDK
└── plugin/
    └── manifest.json       # declarative capability metadata only
```

The repository is intentionally **plugin-ready, not plugin-coupled**. Core packages are guarded against `@memoflow/*` dependencies.

## Run locally

Requirements:

- Node.js 24+
- pnpm 10.15.1+

```bash
pnpm install
pnpm check
pnpm server
# separate terminal
pnpm web
```

Defaults:

```text
Database: ./data/job-harness.db
Health:   http://127.0.0.1:3000/healthz
MCP:      http://127.0.0.1:3000/mcp
REST:     http://127.0.0.1:3000/api/v1
Web dev:  http://127.0.0.1:3001
```

Configuration:

```text
JOB_HARNESS_DB
JOB_HARNESS_HOST
JOB_HARNESS_PORT
JOB_HARNESS_AUTH_TOKEN
JOB_HARNESS_API_URL
JOB_HARNESS_WEB_PASSWORD
JOB_HARNESS_WEB_SESSION_SECRET
JOB_HARNESS_WEB_SESSION_TTL_HOURS
JOB_HARNESS_WEB_COOKIE_SECURE
```

The CLI refuses to bind to `0.0.0.0` or `::` unless `JOB_HARNESS_AUTH_TOKEN` is configured. The Web login is optional and independent from the REST/MCP bearer boundary; see [self-hosted Web authentication](docs/security/self-hosted-web-auth.md).

## Docker Compose self-hosting

The supported packaged deployment uses one image for a private REST/MCP Server container and a host-published Web container. By default only Web is bound to `127.0.0.1`; SQLite is persisted through a host bind mount.

```bash
cp deploy/self-host.env.example deploy/self-host.env
# Fill JOB_HARNESS_AUTH_TOKEN and optional Web session settings.
docker compose --env-file deploy/self-host.env up -d --build
```

Validate packaging locally with:

```bash
pnpm check:deployment
JOB_HARNESS_SMOKE_IMAGE=job-harness:local pnpm smoke:deployment
```

Browser E2E uses an isolated temporary SQLite database and a production Next build:

```bash
pnpm exec playwright install chromium # once per machine
pnpm e2e
```

See [self-hosted deployment](docs/deployment/self-hosted.md) for security defaults, upgrades, backup/restore, and reverse-proxy guidance, and [browser E2E](docs/testing/browser-e2e.md) for the responsive/auth/application regression suite.

## Legacy migration

Historical `job-apply-copilot` data can be imported without bypassing the Job Harness application layer:

```bash
pnpm import:legacy -- \
  --applications /path/to/applications.jsonl \
  --pool /path/to/application-pool/current.json \
  --resume-manifest /path/to/resumes.json \
  --db ./data/job-harness.db
```

The import is fingerprinted and idempotent. See [migration documentation](docs/migration/job-apply-copilot.md).

## MCP model

MCP is an adapter, not a business owner:

```text
ChatGPT / Agent
      -> MCP protocol transport
      -> CareerMcpRuntime
      -> CareerApplicationPorts
      -> SQLite repositories
```

All V1 tools mutate Job Harness state only. There is no `submit_application` tool and no built-in web-search provider.

## Future MemoFlow compatibility

MemoFlow is a future host target, not a dependency. A future adapter may consume public Job Harness contracts/client capabilities and contribute Goal/Task/Schedule/AI integrations without moving Career domain truth into MemoFlow.

See [REST v1](docs/api/rest-v1.md), [North-Star Architecture](docs/architecture/north-star.md), [Product design baseline](docs/product/README.md), [Roadmap](docs/roadmap.md), and [MemoFlow integration boundary](docs/integration/memoflow.md).
