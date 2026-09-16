# @job-harness/server

Standalone Job Harness composition root.

It composes:

```text
SQLite -> Career Application/Workspace Ports -> REST v1 + Career MCP Runtime -> Streamable HTTP MCP
```

Run from the repository root:

```bash
pnpm server
```

Default endpoints:

- `GET http://127.0.0.1:3000/healthz`
- `POST http://127.0.0.1:3000/mcp`
- `GET/POST/PATCH/PUT http://127.0.0.1:3000/api/v1/*`

Set `JOB_HARNESS_AUTH_TOKEN` before binding to `0.0.0.0` or `::`. The CLI refuses a non-loopback bind without a bearer token.

See [`docs/api/rest-v1.md`](../../docs/api/rest-v1.md) for the REST surface.
