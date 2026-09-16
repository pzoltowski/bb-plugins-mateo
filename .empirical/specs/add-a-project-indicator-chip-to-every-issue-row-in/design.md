# Design

- Register `Cube` in `plugins/taskboard/components/ui/icon.tsx`: import
  `CubeIcon` from `@hugeicons/core-free-icons` and add `Cube: CubeIcon` to
  `ICON_MAP` (alphabetical placement next to `Container`). No new assets.
- In `WorkItemRow` (app.tsx), render inside the `.tb-row-trailing` meta
  cluster — after the (currently unused) `showProject` BB-project name and
  before `AssigneeMark` — a ghost-text project indicator:
  `Icon name="Cube"` at `size-3` plus the `item.project` string in a
  truncating span (`max-w-28 truncate`, matching the existing project-name
  treatment). Render only when `item.project` is non-empty. Extend the row
  button's `aria-label` with `Project <name>.` alongside the existing
  Priority/Assigned phrasing.
- In `KanbanCard` (app.tsx), extend the bottom `.tb-meta` row: render it when
  `item.project`, `pending`, or `assignee` is present. Non-pending layout is
  project indicator left, `AssigneeMark` right (`ml-auto` preserved). Pending
  keeps the existing `Updating…` treatment; the indicator still shows.
  Extend the card button's `aria-label` with `Project <name>.`.
- No new color: the indicator inherits `color: var(--tb-ink-subtle)` from
  `.tb-meta`; the Cube glyph uses `currentColor`. No pill, background,
  border, or per-project tone.
- Small shared presentational helper `ProjectGhostMark({ project })` in
  app.tsx near `PriorityMark`/`AssigneeMark` so both surfaces render the
  identical glyph+name treatment.
- `item.project` is already populated (`contract.ts` `workItemSchema`,
  sources/linear.ts, sources/jira.ts, sources/github.ts,
  sources/github-projects.ts); no schema, mapping, filter, search, movement,
  or detail changes.
- Tests: extend `test/app-ui.test.ts` source-regex assertions (existing
  convention) to pin the Cube registration and both render sites.
