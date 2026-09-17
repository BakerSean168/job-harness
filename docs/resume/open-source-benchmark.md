# Resume Open-source Benchmark

This benchmark is used to make ownership and lifecycle decisions, not to copy implementations wholesale.

## Reactive Resume

Repository: https://github.com/reactive-resume/reactive-resume

Useful patterns:

- separates schema, pure resume behavior, PDF generation, API and web UI into focused packages;
- live editing and preview are first-class product paths;
- supports self-hosting and portable exports;
- recent versions combine resume building with application tracking, which validates the product-level decision to keep Resume and Career workflows in one application;
- PDF generation is an adapter that has changed implementations over time without redefining the resume domain.

Job Harness takeaway: keep `resume-domain` / `resume-contracts` independent from renderer and Career persistence. Do not put Chromium or a PDF implementation into the domain.

## JSON Resume

Project: https://jsonresume.org/
Schema: https://github.com/jsonresume/resume-schema

Useful patterns:

- canonical structured resume data is independent from themes/renderers;
- portable JSON provides import/export interoperability;
- schema evolution is explicit.

Job Harness takeaway: maintain a structured canonical document and later provide JSON Resume adapters. JSON Resume is an interchange format, not the internal domain because it does not own Profile recipes, immutable Revision history or Application bindings.

## OpenResume ATS

Repository: https://github.com/DionataNunesGarcia/openresume

Useful patterns:

- semantic HTML and linear document flow;
- selectable text and clickable links;
- print CSS + Playwright PDF pipeline;
- ATS-oriented rendering invariants rather than screenshot/canvas PDFs;
- multi-format export and live preview.

Job Harness takeaway: preserve the current semantic HTML/Nunjucks renderer initially and add explicit ATS/rendering regression checks. Rendering must remain replaceable behind an artifact-renderer port.

## iceinvein/resume-builder

Repository: https://github.com/iceinvein/resume-builder

Useful patterns:

- one validated Resume model is shared by structured form editing and source editing;
- live preview is driven by the current draft, not only persisted state;
- source editing is an alternate editing surface, not a second source of truth.

Job Harness takeaway: `/resumes` should offer Form and Source modes over the same draft object. Source mode must parse back through the same Zod contracts before save/publish.

## Decisions

Adopt:

1. canonical structured document;
2. separate mutable Profile from immutable Revision;
3. renderer as adapter;
4. live preview from unsaved draft;
5. portable import/export;
6. application tracking and resume usage in one product while retaining bounded contexts.

Do not adopt in the first merge:

- many visual templates;
- multi-user auth/permissions;
- S3/Postgres solely for Resume;
- freeform drag-to-position canvas editing;
- AI auto-edit without explicit review/publish;
- a template/plugin marketplace.
