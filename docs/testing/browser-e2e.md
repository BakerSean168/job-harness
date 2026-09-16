# Browser E2E and responsive regression

Job Harness uses Playwright Chromium for a small production-mode browser suite. The suite is intentionally end-to-end: it starts the real SQLite-backed REST server, starts a built Next.js server, signs into the Web session, and exercises the same Server Action / REST / application-domain boundaries used by self-hosted deployments.

## Isolated fixture

The E2E server uses `.tmp/e2e/career.db`; it never opens `data/dev.db`.

`apps/server/e2e/start-server.ts` creates a deterministic fixture through the normal application service:

```text
E2E Campaign
  -> DiscoveryRun
  -> E2E Labs / E2E Agent Engineer
  -> shortlisted
  -> Application
  -> screening
```

The browser test then advances the Application from `screening` to `assessment`, proving that the keyboard-accessible stage selector still reaches the Server Action, REST API and Domain transition policy.

## Covered paths

`e2e/web-primary.spec.ts` covers:

- unauthenticated workspace request -> `/login`;
- signed Web session login;
- Jobs table -> Job modal side panel -> Escape close;
- Applications Board -> server-validated stage transition -> Application modal side panel;
- Settings -> real Career JSON download;
- logout -> login page;
- 390 x 844 mobile viewport;
- mobile bottom navigation;
- no page-level horizontal overflow;
- horizontal scrolling remains inside Jobs table / Applications board containers;
- mobile record side panel becomes a full-viewport dialog;
- Settings download actions remain usable at phone width.

## Responsive contract

At desktop widths the persistent left sidebar remains the primary navigation. At tablet widths it collapses to the existing icon rail. At `<= 640px`:

- the sidebar becomes a fixed, horizontally scrollable bottom navigation;
- the placeholder command search is hidden so the top bar only contains real controls;
- workspace headers stack vertically;
- the body stays contained to the viewport;
- dense tables remain intentionally horizontally scrollable inside their table containers;
- the Applications board presents viewport-sized lanes with horizontal snap scrolling;
- modal record panels occupy the full viewport;
- Settings actions stack and expand to the available width.

This preserves information density without pretending that an eight-column desktop table should be reformatted into a different mobile domain model.

## Run locally

Install Chromium once:

```bash
pnpm exec playwright install chromium
```

Then run:

```bash
pnpm e2e
```

For a visible browser:

```bash
pnpm e2e:headed
```

`pnpm e2e` first runs the production Next build and then starts both test servers through `playwright.config.ts`.

## CI

The GitHub Actions `e2e` job installs Chromium with its system dependencies and runs `pnpm e2e`. It is separate from:

- `verify`: TypeScript, unit/integration tests and Next production build;
- `deployment`: Compose topology, fresh image build and container restart/persistence smoke.

Keeping these gates separate makes failures attributable: application regressions, browser regressions and container/deployment regressions do not hide behind one monolithic job.
