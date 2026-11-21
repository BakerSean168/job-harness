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

## Private proxy hostnames

A server bound to loopback accepts only localhost Host headers by default. For an existing private reverse proxy, set `JOB_HARNESS_ALLOWED_HOSTNAMES` to a comma-separated list of exact DNS hostnames, for example `jobs.example.test`. Schemes, ports and wildcards are rejected. This option requires `JOB_HARNESS_AUTH_TOKEN`; allowing a hostname does not bypass Bearer authentication or change the listening address. Keep the worker behind the private ingress.

Project highlights can carry an optional `evidenceUrl` in the resume library. Only HTTP(S) URLs without embedded credentials are accepted. The resolver preserves the link in revisions and the compact template renders it with its highlight label, or a localized visible label when none was authored. Existing resumes without evidence URLs remain valid.
