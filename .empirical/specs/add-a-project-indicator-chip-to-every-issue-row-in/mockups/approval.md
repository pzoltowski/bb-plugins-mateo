# Mockup approval

Chosen: **B — Ghost text** (approved by Patryk, 2026-09-16).

Ruled out: **A — Pill container** matching label chips — it reads as another
label and loses the project/label distinction.

- styling: tokens
- Chosen design: vendored Hugeicons `Cube` glyph + project name in
  single-tone muted gray text, no pill container. Reuses the existing
  `.tb-meta` / `--tb-ink-subtle` muted meta color and the
  `components/ui/icon.tsx` registry; no new CSS tokens.
- Rationale: most Linear-like; the absence of a pill container is the
  differentiation from label chips.
- Approved by: Patryk — pre-approved in the task brief for this retry after
  the prior attempt's options review.
- Notes: Always one neutral gray, no per-project colors. Cube glyph must come
  through the plugin's icon registry (`components/ui/icon.tsx`), no new icon
  assets. Render whenever `item.project` is non-empty.
