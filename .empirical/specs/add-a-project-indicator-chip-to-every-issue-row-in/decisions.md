# Decisions: Add A Project Indicator Chip To Every Issue Row In

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Ghost-text project indicator via the icon registry

Status: Accepted

### Evidence

`WorkItem.project` is already populated by every source: Linear
(`project?.name ?? team.name`), Jira (`fields.project.name`), GitHub
(`value.repo`), GitHub Projects (`repository.nameWithOwner`). List rows keep
metadata in `.tb-row-trailing`; Kanban cards keep a bottom `.tb-meta` row.
`.tb-meta` already resolves to the muted `--tb-ink-subtle`. The vendored
`@hugeicons/core-free-icons` package exports `CubeIcon`; the plugin's
`components/ui/icon.tsx` `ICON_MAP` has no `Cube` entry yet. Patryk
pre-approved direction B (ghost text) for this retry.

### Options

A — pill container matching `.tb-label-chip`; B — ghost text (Cube + name in
the existing muted meta color); C — icon-only mark.

### Chosen approach

B — ghost text. Register `Cube` in the icon registry and render one shared
`ProjectGhostMark` in `WorkItemRow`'s trailing meta and `KanbanCard`'s bottom
meta row whenever `item.project` is non-empty, naming the project in both
accessible labels.

### Trade-offs and risks

Nearly every row gains text since all providers populate `project`;
truncation (`max-w-28`) and the containerless muted treatment keep the meta
line restrained. Kanban cards without assignees gain a meta row they lacked.
Linear items without a Linear project display the team name (source-provided
value shown as-is).

### Verification

Source-regex assertions in `test/app-ui.test.ts`, root `npm run check`, live
`bb plugin reload taskboard` screenshots of List and Kanban rows.
