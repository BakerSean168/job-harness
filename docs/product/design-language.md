# Design language

## Visual direction

Use a **dense, quiet, professional workspace** rather than a marketing dashboard.

Primary inspiration:

- Twenty: table density, side panel, search/command surface, record navigation;
- Plane: board/display controls, grouping/filter discoverability, operational density;
- focused job trackers: compact cards and obvious stage movement.

## Layout

- Persistent left sidebar: 220-248px expanded, collapsible later.
- Workspace header: page title/view selector on left; search/filter/sort/display/actions on right.
- Main content uses available width; avoid narrow centered admin cards for datasets.
- Right side panel: approximately 420-520px on desktop, resizable later if justified.
- Full record page for deep work; side panel for browse/triage.

## Density

Default table row target: 40-48px.

Prefer:

- one-line role/company where possible;
- compact status badges;
- secondary metadata in muted text;
- progressive disclosure rather than giant cards.

Provide a future compact/comfortable density preference only if real usage shows a need.

## Typography

Use the application/system sans stack chosen by the Web framework; prioritize Chinese/Latin consistency and numeric scanability. Avoid adding a custom font dependency solely for branding.

Hierarchy:

- page title: 20-24px semibold;
- section title: 14-16px semibold;
- body/table: 13-14px;
- metadata: 12px;
- KPI number: 24-32px with explicit label/time window.

## Color

Neutral surfaces dominate. Color communicates semantics, not decoration.

Suggested semantic families (exact tokens belong to the theme system):

- discovered/neutral: neutral/blue-muted;
- shortlisted/active: blue/indigo;
- screening/assessment: amber/purple distinction;
- interview: cyan/blue emphasis;
- offer/success: green;
- rejected/closed: red only when attention is useful, otherwise muted terminal;
- ignored/archived: gray.

Never rely on color alone; every state also has text/icon semantics.

## Components

Prefer shadcn-style headless/composable primitives and accessible behavior. Web V1 needs:

- AppShell / Sidebar;
- WorkspaceHeader;
- DataTable;
- FilterBar;
- ViewSwitcher;
- StatusBadge;
- RecordSidePanel;
- KanbanBoard/Card;
- Timeline;
- KPI cards;
- EmptyState;
- Command/Search surface;
- Toast / inline error;
- Dialog/Confirm for destructive actions.

Do not build a bespoke design-system framework before these screens exist.

## Interaction principles

1. **Stay in context.** Use side panels for inspection and quick changes.
2. **Every badge can become a filter.** Status/source/company chips should enable fast navigation where practical.
3. **Optimistic only when reversible.** Stage drag can be optimistic but must reconcile with server validation.
4. **Agent provenance is visible.** Imported/ChatGPT/system writes should be inspectable in timeline/detail.
5. **External actions are explicit.** “Open original” is visually distinct from local state writes.
6. **No hidden automation.** Job Harness does not silently apply, email, or schedule external actions.

## Internationalization

Web V1 starts with:

```text
zh-CN (default for current deployment)
en
```

No user-visible strings should be scattered through components. Use message catalogs/namespaces from the first UI commit.

Store domain enum values as stable language-neutral identifiers (`screening`, `shortlisted`); localize labels at presentation time.

Dates/numbers must use locale-aware formatting. Persist timestamps in UTC/ISO semantics and render in the selected/user timezone.

## Accessibility

- keyboard reachable tables/menus/dialogs;
- visible focus states;
- semantic headings and landmarks;
- text labels for statuses/icons;
- sufficient contrast in both light and dark themes;
- reduced-motion friendly drag/transition behavior.

## Theme

Ship light and dark themes, but do not let theme work block the vertical slice. Use semantic tokens from the beginning so both modes share component logic.
