# SQLite v9 — retained browser session handoff

R019 can fill an external application form before a human reviews it, but the browser page itself is not durable Job Harness state. Releasing a managed Steel session after filling can discard the current DOM/form state; keeping a worker lease while a human reviews the page would instead trap queue ownership and make crash recovery ambiguous.

Schema v9 therefore adds a single nullable `browser_session_handoff_json` projection to `execution_attempts`. The payload is intentionally narrow and typed:

- browser backend id;
- opaque session reference;
- optional human-control URL;
- retained timestamp;
- expiry timestamp.

It must never contain cookies, local/session storage, passwords, bearer tokens, page form values or resume bytes. Those remain inside the browser backend/private worker boundary.

The state protocol is:

```text
running
  -> worker retains managed browser session
  -> waiting_for_user + durable handoff reference
  -> worker lease is released
  -> human reviews the live page
  -> explicit resume (only before expiry)
  -> queued
  -> compatible worker claims
  -> backend resumes the exact retained session
```

An expired handoff is not silently replaced by a fresh browser. `resume` fails closed so a reviewed page cannot accidentally be substituted with a different DOM/session. The attempt can then be explicitly cancelled/restarted.

Steel self-hosting is treated as an infrastructure backend, not as the durable timeout owner. The Apply Worker writes a private local retained-session registry and reaps expired Steel sessions itself. This also bounds orphan browser sessions after worker restarts. Local-CDP handoffs never close the user-owned Chrome when the logical TTL expires.
