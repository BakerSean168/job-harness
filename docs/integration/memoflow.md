# MemoFlow integration boundary

Status: **planned, not implemented**.

Job Harness is an independent system. MemoFlow may later consume it as an optional first-party extension/plugin.

## Dependency direction

```text
MemoFlow Host
    -> Career/Job Extension Adapter
    -> @job-harness/client + @job-harness/contracts
    -> Job Harness API/MCP/Application boundary
```

The reverse dependency is forbidden:

```text
Job Harness core
    -X-> @memoflow/*
```

## Future contribution seams

The eventual MemoFlow adapter may contribute:

- Goal intent support such as `career.find-job`;
- Goal metric providers derived from Job Harness facts;
- Task suggestions for application/interview follow-up;
- Scheduler handlers such as `career.discovery.run`;
- AI tools backed by the same Job Harness application contract.

None of these are implemented in this repository yet.

## Ownership

- Job / Company / Application / Campaign / DiscoveryRun: Job Harness.
- Goal / Key Result: MemoFlow Goal.
- Task: MemoFlow Task.
- Time rule / durable invocation: MemoFlow Schedule + Scheduler.
- AI thread/run: host AI runtime (for example ChatGPT or MemoFlow Mastra).
- Resume content: Resume project.
- Knowledge Markdown: Thought Forest.

Integration uses stable references/IDs and public APIs, never cross-database foreign keys.
