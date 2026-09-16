# Add A Project Indicator Chip To Every Issue Row In

## Request

> Add a project indicator chip to every issue row in the bb Taskboard plugin (plugins/taskboard). Approved design 'Ghost text': vendored Hugeicons Cube glyph + project name in single-tone muted gray text, no pill container. Render as trailing meta in WorkItemRow (list view) and bottom meta row in KanbanCard (kanban view). item.project is already populated by all three sources (Linear project.name ?? team.name, Jira fields.project.name, GitHub repo/nameWithOwner); render whenever non-empty, zero data-layer changes expected. Register/reuse the Cube glyph via the plugin's icon registry at components/ui/icon.tsx — no new icon assets. Always one neutral gray, no per-project colors.

## Goal

Every issue row and kanban card identifies which tracker-side project the work
belongs to, using the already-populated `WorkItem.project` value. The
indicator is "ghost text" — the registered Hugeicons Cube glyph followed by
the project name in the row's existing muted meta color — visually distinct
from pill-shaped label chips precisely because it has no container.

## Acceptance Criteria

- [ ] [AC-1] [UI] In List view, each `WorkItemRow` whose item has a non-empty
  `item.project` shows the Cube icon followed by the project name in the row's
  trailing meta cluster, before the assignee mark and updated time.
- [ ] [AC-2] [UI] In Kanban view, each `KanbanCard` whose item has a non-empty
  `item.project` shows the Cube icon followed by the project name in the
  card's bottom meta row, with the assignee mark still right-aligned.
- [ ] [AC-3] The indicator renders as ghost text: no pill/chip container, no
  background or border, one neutral muted gray (`--tb-ink-subtle` via
  `.tb-meta`), never a per-project color.
- [ ] [AC-4] Items whose `project` is null or empty render exactly as before;
  the meta row adds no empty slot or stray gap.
- [ ] [AC-5] The Cube glyph is registered in `components/ui/icon.tsx`
  (`ICON_MAP`) reusing the vendored `@hugeicons/core-free-icons` `CubeIcon`
  export; no new icon assets are added.
- [ ] [AC-6] The project name participates in the row/card accessible label,
  consistent with how priority and assignee are announced.
- [ ] [AC-7] Long project names truncate without breaking row or card
  geometry; List grid columns and card layout are unchanged.
- [ ] [AC-8] No data-layer change: Linear, Jira, GitHub, and GitHub Projects
  source mapping, filtering, search, movement, and detail behavior are
  unchanged.

## Scope

- Register `Cube` in the plugin icon registry (`components/ui/icon.tsx`) via
  the existing `@hugeicons/core-free-icons` `CubeIcon` export.
- Render the ghost-text indicator in `WorkItemRow`'s `.tb-row-trailing` meta
  cluster and in `KanbanCard`'s bottom `.tb-meta` row in `app.tsx`.
- Extend both components' accessible labels to name the project.
- Source-regex assertions in `test/app-ui.test.ts` matching existing test
  conventions.

## Non-goals

- No changes to `WorkItem` schema, source mapping, or `item.project`
  population; the field is already populated by all providers.
- No per-project colors, pills, badges, or containers.
- No new filter, sort, or grouping behavior based on project.
- No change to the separate BB-project name (`showProject`/`TrackerProject`)
  display path, which remains independent and currently unused.
- No changes to item detail, creation, movement, or drag contracts.

## Risks

- `item.project` is populated for all current providers, so nearly every row
  gains text; truncation and the ghost (containerless) treatment keep the meta
  line restrained. Kanban cards gain a meta row for items that previously had
  none (no assignee), slightly increasing card height — accepted by the
  approved design.
- Linear items without a Linear project show the team name; this is the
  source-provided value and is shown as-is.

## Verification

- `npm install && npm run check` from the workspace root (scripts clear
  `BB_CLI`).
- Source-regex assertions for the chip in `test/app-ui.test.ts`.
- Live UI evidence: reload the real plugin (`bb plugin reload taskboard`)
  running from this checkout's path and screenshot List and Kanban rows
  showing the chip.

## Capability Deltas

- `deltas/taskboard-browser.md`
