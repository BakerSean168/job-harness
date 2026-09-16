# Job Harness

Job Harness is a plugin-ready, AI-friendly job-search state and workflow system.

Its core responsibility is **not** to be an autonomous job-search AI. Instead, it owns durable career-search facts and exposes stable tools so external brains such as ChatGPT Web or a future MemoFlow AI host can read and update those facts safely.

## North star

> Domain owns truth. Extensions contribute capabilities. Hosts compose capabilities. AI consumes tools.

Job Harness owns:

- companies and jobs;
- job observations and discovery runs;
- job-search campaigns;
- applications and application timelines;
- resume registry metadata;
- deduplication and search history.

It does **not** own:

- MemoFlow Goals, Tasks, Schedules, or AI runtime;
- Resume source content;
- Thought Forest knowledge content;
- a built-in general web-search agent.

## Repository shape

```text
job-harness/
├── docs/
│   ├── architecture/
│   └── integration/
├── packages/
│   ├── contracts/      # public schemas and stable DTO/tool contracts
│   ├── domain/         # career domain truth
│   ├── application/    # use-cases and ports
│   ├── mcp/            # ChatGPT/agent-facing MCP adapter
│   └── client/         # host-neutral SDK/client
└── plugin/
    └── manifest.json   # declarative capability metadata only
```

The repository is intentionally **plugin-ready, not plugin-coupled**. No MemoFlow runtime dependency is allowed in core packages.

## Integration status

Current status: **planning / contract-first**.

MemoFlow integration is not implemented yet. A future adapter may consume the public client/contracts and register Goal/Task/Schedule/AI contributions on the MemoFlow side without moving Job Harness domain ownership into MemoFlow.

See [North-Star Architecture](docs/architecture/north-star.md) and [MemoFlow integration boundary](docs/integration/memoflow.md).
