# Plan

1. `plugins/taskboard/components/ui/icon.tsx`: import `CubeIcon` from
   `@hugeicons/core-free-icons`; add `Cube: CubeIcon` to `ICON_MAP` in
   alphabetical order (after `Copy`, before `CornerDownLeft` region per the
   map's ordering). Commit.
2. `plugins/taskboard/app.tsx`: add `ProjectGhostMark({ project })` helper
   next to `PriorityMark`/`AssigneeMark` — Cube glyph (`size-3`, aria-hidden)
   + truncated project name span (`max-w-28 truncate`, `title={project}`),
   inheriting `.tb-meta` muted color. Commit.
3. `plugins/taskboard/app.tsx` `WorkItemRow`: render
   `<ProjectGhostMark project={item.project} />` inside `.tb-row-trailing`
   when `item.project` is non-empty, after the `showProject` name and before
   `AssigneeMark`; append `Project <name>.` to the row button `aria-label`.
4. `plugins/taskboard/app.tsx` `KanbanCard`: widen the bottom `.tb-meta` row
   condition to `pending || assignee || project`; render the indicator left
   and keep `AssigneeMark` `ml-auto`; pending keeps `Updating…`; append
   `Project <name>.` to the card button `aria-label`. Commit steps 2–4.
5. `plugins/taskboard/test/app-ui.test.ts`: add source-regex assertions —
   `Cube: CubeIcon` registration, `ProjectGhostMark` usage in `WorkItemRow`
   trailing meta and `KanbanCard` bottom meta, aria-label project phrasing.
6. Run `npm install && npm run check` from the workspace root; fix and
   recommit until green. Commit tests.
7. `bb plugin reload taskboard` (the live plugin already runs from this
   checkout's path — never `bb plugin install`); open Taskboard in List and
   Kanban and capture screenshots showing the chip.
8. Feed verification receipts back through the Empirical verify phase;
   integrate and report branch, commits, files changed, and live version.
