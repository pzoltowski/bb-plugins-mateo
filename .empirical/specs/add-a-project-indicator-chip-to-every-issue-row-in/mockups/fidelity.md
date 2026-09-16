# Mockup fidelity

- Verdict: loyal

Compared the approved mockup ([index.html](index.html), direction **B —
Ghost text**) against the built Taskboard surface captured in a real browser
(session receipts `qa-762e13b2a1f5d023176d8691`):

- [project-chip-list.png](../qa/project-chip-list.png) — List view on a live
  Linear-backed project (`rn-datagui`, 333 rows). Every visible row's
  trailing meta cluster shows the Cube glyph followed by the project name in
  the shared muted meta color, ahead of the updated time; no pill container,
  no background, no border, no per-project color.
- [project-chip-kanban.png](../qa/project-chip-kanban.png) — Kanban view of
  the same project. Each card's bottom meta row shows the same Cube glyph +
  project ghost text while the assignee mark stays right-aligned; label
  chips elsewhere retain their own pill styling, keeping the ghost-text
  distinction.

Both captures match the approved direction: single neutral gray
(`.tb-meta` / `--tb-ink-subtle`), decorative glyph, project name only,
truncation consistent with neighboring metadata.

### Divergence: none observed

- Divergence: none
- Accepted: n/a
