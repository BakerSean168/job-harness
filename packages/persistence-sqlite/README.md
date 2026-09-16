# @job-harness/persistence-sqlite

Standalone SQLite persistence adapter built on Node.js `node:sqlite`.

It owns schema migration, repositories, transactions, durable idempotency receipts, dedupe indexes, application timelines, and campaign/discovery projections. It does not own business lifecycle rules; those stay in `@job-harness/application`.
