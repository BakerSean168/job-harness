# @job-harness/importers

Compatibility import adapters for historical job-search systems.

The first adapter migrates `job-apply-copilot` JSONL/pool data through `CareerApplicationPorts`; it never bypasses application lifecycle, idempotency, or persistence boundaries.


The adapter is listing-aware: strong listing identities reconcile aliases to one Opportunity, while generic careers pages stay scoped. One Opportunity owns one V1 Application pipeline; independently evidenced repeat submissions are retained as `application_recorded` timeline events rather than duplicate pipelines.
