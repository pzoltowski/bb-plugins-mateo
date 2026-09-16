# Fresh-context final QA

Overall: PASSED

Evidence is limited to the committed files at
`c62e4f9b19266634746a2f42e634cdb71b05993d`, the live-browser capture receipts
(`qa-762e13b2a1f5d023176d8691`), the root check receipt
(`qa-fc6105bb6d17fd2139636950`), and the two supplied PNG captures. The
focused suite completed with 20/20 `app-ui.test.ts` tests passing and the
root `npm run check` gate green.

- AC-1 — PASS. `WorkItemRow` renders `ProjectGhostMark` inside the trailing
  `tb-row-trailing`/`tb-meta` cluster ahead of the assignee and updated-time
  metadata ([app.tsx](../../../../plugins/taskboard/app.tsx));
  `project-chip-list.png` shows the Cube glyph + project ghost text on every
  visible row.
- AC-2 — PASS. `KanbanCard` renders `ProjectGhostMark` in the bottom meta
  row while the assignee mark keeps its right-aligned slot;
  `project-chip-kanban.png` shows the mark on each card.
- AC-3 — PASS. The mark is plain `.tb-meta` muted text with a decorative
  glyph: the browser harness asserted no `tb-label-chip`/`rounded-full`/
  border/background classes on the rendered element, and no per-project
  color path exists.
- AC-4 — PASS. `ProjectGhostMark` returns `null` for null/empty
  `item.project`, so no empty slot or stray gap is added; existing rows
  without a project are unchanged.
- AC-5 — PASS. `CubeIcon` is imported from the vendored
  `@hugeicons/core-free-icons` and registered as `Cube` in `ICON_MAP`
  ([icon.tsx](../../../../plugins/taskboard/components/ui/icon.tsx)); no new
  icon assets were added.
- AC-6 — PASS. Row and card `aria-label`s include
  `Project <name>` alongside priority and assignee; the live harness
  asserted the first row's accessible label contains its rendered project
  name.
- AC-7 — PASS. The mark inherits `.tb-meta` truncation (`min-w-0` +
  `truncate`) inside the unchanged List grid and card layout; the captures
  show `pzoltowski/mo…`-style truncation without geometry breakage.
- AC-8 — PASS. No provider or data-layer file changed: Linear
  `project.name ?? team.name`, Jira `fields.project.name`, and GitHub
  `nameWithOwner` mappings, filtering, search, movement, and detail
  behavior are untouched (diff scope: `app.tsx`, `icon.tsx`,
  `app-ui.test.ts`, Empirical artifacts only).
