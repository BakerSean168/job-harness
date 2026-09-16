# Product design baseline

This directory freezes the Job Harness product model before Web V1 implementation.

The product design is benchmark-driven rather than invented from scratch. We borrow proven interaction patterns and domain concepts from mature/open-source job trackers, CRM/work-management products, and resume tools, while keeping Job Harness's architecture distinct:

> Job Harness owns durable career-search truth and exposes tools. It does not own the AI model, general web search, task system, calendar scheduler, or resume authoring source.

Documents:

- [Open-source benchmark](./open-source-benchmark.md)
- [Domain map](./domain-map.md)
- [Information architecture](./information-architecture.md)
- [Dashboard specification](./dashboard-spec.md)
- [Jobs workspace specification](./jobs-workspace-spec.md)
- [Application pipeline specification](./application-pipeline-spec.md)
- [Design language](./design-language.md)
- [Web V1 implementation plan](./web-v1-plan.md)

Status: **frozen for Web V1 planning**. Domain changes identified here must land before UI code depends on the old shape.
