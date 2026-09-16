# @job-harness/application

Transport-neutral Job Harness use cases and ports.

The application service owns runtime validation, lifecycle transitions, transaction orchestration, and idempotency semantics. HTTP/MCP/UI adapters must call these ports instead of persistence directly.
