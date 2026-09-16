# @job-harness/contracts

Canonical runtime-validated Job Harness contracts shared by application, REST, MCP, Web and host integrations.

The package owns data shapes only; it contains no persistence, transport or host-runtime implementation. `CareerIntegrationBindingSchema` is explicitly a **host-owned integration value**: Job Harness exports the schema so adapters agree on the shape, but Career persistence must not store Goal truth or create cross-database foreign keys.
