# Design: Dockside project badge upgrade

## Data flow

```
bb plugin settings (bb.settings.define in server.ts)
  └─ badgeLetters: "Two letters" | "One letter"     (default "Two letters")
  └─ preferProjectIcon: boolean                      (default true)
        │
        ▼  app-side useSettings().values
resolveDocksidePreferences(values)              lib/preferences.ts
  └─ preferences.badgeLetterCount: 1 | 2
  └─ preferences.preferProjectIcon: boolean
        │
        ▼
projectBadgeText(project.name, count)           lib/project-colors.ts
automaticProjectColor(badgeText)                letter-keyed FNV-1a → palette
projectBadgePresentation(projectId, badgeText, override)
        │
        ▼  badge text + colors + icon map
ProjectGroup                                    components/inbox/project-group.tsx
  renders <img> (icon mode) or <span> letters (fallback)

server icon path:
bb.sdk.projects.list() → ProjectResponse.sources[] (isDefault, local_path)
  └─ resolveProjectIcon(sourcePath)             lib/project-icons.ts
        └─ RPC listProjectIcons → { icons: [{ projectId, dataUrl }] }
        └─ realtime publish "project-icons"
  └─ hooks/use-project-icons.ts (mirrors use-project-colors)
        └─ ReadonlyMap<projectId, dataUrl> → thread-inbox → ProjectGroup
```

## Module changes

### `lib/project-colors.ts` (pure, app+server shared)

- `projectBadgeText(name: string, count: 1 | 2): string` —
  split `name.trim()` on `/[^A-Za-z0-9]+/`; drop empty tokens.
  - count 1 → first char of first token, uppercased, else `"?"`.
  - count 2 → first chars of first two tokens, uppercased; one token → its
    first two alphanumeric chars padded with `"?"`; no tokens → `"??"`.
- `automaticProjectColor(badgeText: string)` — existing FNV-1a body, input is
  now the rendered badge text (uppercase ASCII). Same letters → same color.
- `projectBadgePresentation(badgeText, override)` — signature changes from
  `projectId` to `badgeText`; override unchanged.
- `projectBadgeLetter` stays exported as the count-1 wrapper for compat.

### `lib/preferences.ts`

- `BADGE_LETTER_OPTIONS = ["Two letters", "One letter"]`.
- `DocksidePreferences` gains `badgeLetterCount: 1 | 2` and
  `preferProjectIcon: boolean`; resolved with `readOption`/`readBoolean`
  fallbacks ("Two letters" → 2, `preferProjectIcon` → true).

### `lib/project-icons.ts` (new, server-only — uses node:fs/node:path)

- `resolveProjectIcon(sourceRoot: string): { dataUrl, mime, bytes } | null`
  - Candidate allowlist, probed in order (first match wins):
    `favicon.svg`, `favicon.png`, `favicon.ico`, `favicon.gif`, `favicon.webp`,
    `icon.svg`, `icon.png`, `logo.svg`, `logo.png`, `apple-touch-icon.png`,
    `public/favicon.{svg,png,ico}`, `static/favicon.{svg,png,ico}`,
    `src-tauri/icons/icon.png`, `src-tauri/icons/32x32.png`
  - Plus `app.json` → `expo.icon` (or top-level `icon`) string path, resolved
    relative to the root, validated against the image-type allowlist.
  - Every candidate: `path.resolve(root, rel)` must stay under `root`
    (`startsWith(root + sep)`), `stat` ≤ `MAX_ICON_BYTES` (256 KiB),
    extension ∈ MIME allowlist (`svg/png/ico/gif/webp/jpg/jpeg` →
    `image/*`), then `readFile` → `data:${mime};base64,…`.
  - Any error (ENOENT, EACCES, oversized, bad JSON, escape) → `null`,
    never throws past the resolver.
- `resolveAllProjectIcons(projects)` maps `bb.sdk.projects.list()` results:
  default source only, `type === "local_path"`, `kind !== "personal"`.

### `server.ts`

- `bb.settings.define` gains `badgeLetters` (select, default "Two letters")
  and `preferProjectIcon` (boolean, default true).
- RPC contract gains `listProjectIcons`: input `{}`, output
  `{ icons: array({ projectId: projectIdSchema, dataUrl: z.string().max(MAX_ICON_DATAURL_LEN) }).max(500) }`.
- Handler: `bb.sdk.projects.list()` → `resolveAllProjectIcons` → publish
  nothing on read; publish `project-icons` after writes are irrelevant —
  icons re-resolve per call (bounded stat+read). New channel constant
  `PROJECT_ICON_CHANNEL = "project-icons"` exported for the hook.

### `hooks/use-project-icons.ts` (new, app-side)

Mirror of `use-project-colors`: `listProjectIcons` RPC →
`ReadonlyMap<string, string>` (projectId → dataUrl), `useRealtime("project-icons")`
refresh, reconnect refresh, `isLoading`, `reload()`.

### `components/inbox/thread-inbox.tsx`

- `const { icons: projectIcons } = useProjectIcons()` and pass
  `projectIcons` to `ProjectGroup`.

### `components/inbox/project-group.tsx`

- New prop `projectIcons: ReadonlyMap<string, string>`.
- `const letters = projectBadgeText(group.project.name, preferences.badgeLetterCount)`
- `badge = projectBadgePresentation(letters, override)`
- Render: `preferences.preferProjectIcon && projectIcons.get(project.id)`
  → `<img src={dataUrl}>` inside the same 20px tile (keep border/rounding,
  `object-fit: cover`); else letter `<span>` with adjusted size class for
  two letters (`text-[8px]` when two chars, `text-2xs` when one).

### `components/settings/dockside-settings.tsx`

- `ProjectColorRow` badge preview uses `projectBadgeText(name, badgeLetterCount)`
  so the preview honors the letter setting; reads `preferProjectIcon` +
  `useProjectIcons` to preview icon mode per row (image or letters).
- Footer summary line gains "badge: two letters · icons on" style text.

## Edge cases

- **Personal project**: `kind === "personal"` or no default local source → no
  icon ever; letters only.
- **Remote-host sources**: unreadable path → `null` → letters.
- **Two-letter legibility**: 20px tile renders two chars at ~8px semibold —
  verified in mockup; if the reviewer finds it cramped the mitigation is a
  slightly wider tile, not a letter change.
- **Stored overrides**: untouched; they key on project id and keep working
  regardless of letter mode.
- **bb without the new settings yet**: `readOption`/`readBoolean` fall back to
  defaults (two letters, icons on).

## Test plan (`node --test`, existing harness)

- `test/project-colors.test.ts`: letter derivation matrix (multi-word,
  kebab/underscore/dot separators, single-word, single-char, empty,
  punctuation-only, unicode letters, leading digits); `automaticProjectColor`
  determinism — same letters → same color, both counts.
- `test/project-icons.test.ts` (new): fixture dirs — hit each allowlist
  branch, precedence order, app.json `expo.icon`, oversized file, wrong
  extension, `../` escape attempt, missing root, personal/no-source skip.
- `test/preferences.test.ts`: new defaults + parsing of both settings.
- `test/settings-contract.test.ts`: contract grep assertions for the new
  settings keys, RPC method, and channel.

## Out of scope (restating spec)

Remote avatars, per-project icon overrides, native bb sidebar, thread-level
icons, animated badges.
