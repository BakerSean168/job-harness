# @job-harness/mcp

Agent-facing Job Harness tool contract and transport-neutral MCP runtime.

`CareerMcpRuntime` validates every invocation against the canonical schemas and dispatches only through `CareerApplicationPorts`; it has no SQLite/database dependency. `apps/server` supplies the official Streamable HTTP protocol transport.
