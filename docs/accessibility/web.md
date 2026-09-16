# Web accessibility and keyboard baseline

W405 hardens the existing Job Harness Web surfaces without changing business behavior.

## Landmarks and navigation

- every authenticated workspace renders a visible-on-focus **Skip to main content** link;
- the workspace content is a named/focusable `<main id="main-content">` landmark;
- the sidebar `<nav>` has a localized accessible name;
- the active sidebar route exposes `aria-current="page"`.

## Focus visibility and motion

All interactive elements share a visible `:focus-visible` outline using the semantic accent token.

`prefers-reduced-motion: reduce` collapses application transitions/animations and disables smooth scrolling. Functional state changes do not depend on animation.

## Side-panel dialogs

Job, Application, Company and Discovery side panels use one shared `RecordSidePanelDialog` implementation:

- `role="dialog"` and `aria-modal="true"`;
- labelled by the panel title;
- programmatic focus on open;
- Tab / Shift+Tab focus loop inside the dialog;
- Escape closes through the same URL-state path as the close button;
- focus returns to the previously focused element when the panel unmounts;
- the backdrop is excluded from the tab order while a labelled close control remains keyboard accessible.

A jsdom interaction test verifies focus entry, both Tab directions, Escape behavior, and focus restoration.

## Tables and alternate interactions

Primary Jobs, Applications, Companies, Resumes and Discovery tables have accessible names. Column headers explicitly declare `scope="col"`.

Applications drag-and-drop is not the only way to change stage: the existing stage select/control remains the keyboard-accessible fallback and still routes through the domain transition command.

## Regression strategy

W405 combines:

- TypeScript/Next production build checks;
- DOM keyboard interaction tests for the shared dialog primitive;
- SSR smoke checks for skip link, landmarks, dialog semantics, table naming and secret non-disclosure.

Visual contrast continues to use the existing semantic light/dark tokens; accessibility must not be implemented by color alone because all Job/Application states also render localized text labels.
