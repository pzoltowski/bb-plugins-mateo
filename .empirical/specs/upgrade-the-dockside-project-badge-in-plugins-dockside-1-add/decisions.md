# Decisions: Upgrade the Dockside project badge

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Select the implementation approach

Status: Accepted

### Evidence

- `plugins/dockside` already renders a one-letter badge in
  `components/inbox/project-group.tsx` via `projectBadgeLetter(name)` and a
  deterministic color via `projectBadgePresentation(projectId, override)`
  (FNV-1a hash of the project id over a 12-color palette) in
  `lib/project-colors.ts`.
- Per-project color overrides already persist in the plugin SQLite table
  `project_badge_colors` with a settings editor and realtime invalidation on
  the `project-colors` channel (`server.ts`, `lib/project-color-store.ts`,
  `hooks/use-project-colors.ts`).
- The sidebar SDK exposes only `{ id, name, isPersonal }` per project, but the
  server SDK exposes `bb.sdk.projects.list()` returning `sources[].path` and
  `gitRemoteUrl`, so icon files can be resolved server-side.
- Plugin settings are declared in `server.ts` via `bb.settings.define` and
  resolved app-side in `lib/preferences.ts`.
- User confirmed: work lands in dockside itself (no new plugin); two-letter
  default with initials-for-multiword derivation; letter-keyed colors; repo
  favicon preferred with letter fallback.
- User rejected nothing but scoped icons to repository files — no remote
  avatar fetching is in scope.

### Options

1. **Serve icons through a new plugin HTTP route** streaming files from disk.
   Rejected: adds an auth/caching surface bb already solves for us; the
   existing project-colors feature moves small payloads over RPC + realtime.
2. **Serve icons as bounded data URLs over a new `listProjectIcons` RPC** with
   a fixed candidate-path allowlist under `sources[].path`. Chosen.
3. Key automatic color on project id (status quo), project name, or rendered
   badge letters. Chosen: **badge letters** — the user's stated requirement is
   that identical letters always share a color.
4. Two-letter derivation by literal first two characters vs first
   alphanumeric character of the first two word tokens. Chosen: **word
   initials** for multi-word names (splits on non-alphanumeric boundaries,
   so "bb-plugins-mateo" → `BP`), first two characters otherwise.

### Chosen approach

In-place change inside `plugins/dockside`: two new declared settings
(`badgeLetters` select, `preferProjectIcon` boolean), a pure letter-derivation
function, re-keyed automatic color hashing the rendered badge text, and a
server-side icon resolver probing a fixed relative-path allowlist
(`favicon.{ico,png,svg}`, `icon.{svg,png}`, `apple-touch-icon.png` at the root
and under `public/`/`static/`; `app.json` `expo.icon`; `src-tauri/icons`)
bounded by a 256 KB size cap and an extension→MIME allowlist, returned as data
URLs via `listProjectIcons` with `project-icons` realtime invalidation.

### Trade-offs and risks

- Every automatic badge color changes once (id→letters re-key). Accepted as
  the requested behavior; stored overrides are unaffected.
- Data-URL payloads are duplicated per client but bounded: ≤256 KB per icon,
  capped project count, and the RPC output schema enforces bounds.
- SVG favicons are untrusted repo content; `<img>` rendering cannot execute
  script, and only allowlisted extensions/MIMEs are returned.
- Icon staleness: resolution re-probes candidates on each fetch (cheap,
  bounded stat+read), so added/removed icons appear on invalidation without
  manual cache clearing.
- The personal project and non-local sources have no usable path; they keep
  letter badges.

### Verification

- Unit tests: letter derivation across word boundaries, unicode/punctuation,
  and empty names; color determinism on identical letters in both modes;
  resolver found/absent/oversized/wrong-type/outside-root cases.
- Live bb check: build, install, reload; screenshot sidebar + settings preview
  in light and dark; toggle both new settings.
