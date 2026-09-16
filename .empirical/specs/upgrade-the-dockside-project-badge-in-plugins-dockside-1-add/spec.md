# Upgrade the Dockside project badge

## Request

> Upgrade the Dockside project badge in plugins/dockside: (1) add a plugin setting for one- vs two-letter badges, default two letters — two-letter rendering uses initials for multi-word project names (first letter of the first two words) and the first two characters for single-word names; (2) key the automatic badge color on the rendered badge letters instead of the project id so the same letters always get the same palette color, while existing per-project color overrides keep working and still win; (3) add a prefer-favicon setting (default ON) that shows a favicon/icon file found in the project's repository — resolved by the plugin server via project sources path — and falls back to the letter badge when no icon exists or the setting is off.

## Goal

Dockside's project header badge becomes a small configurable project avatar:
two letters by default, a deterministic color that belongs to the rendered
letters, and an opt-out preference that shows the project's own favicon/icon
file when one exists in its repository. Everything falls back to today's
letter badge.

## Acceptance Criteria

- [ ] [AC-1] Dockside declares a `badgeLetters` select setting ("Two letters" default, "One letter") and a `preferProjectIcon` boolean setting (default on), visible in bb's plugin settings.
- [ ] [AC-2] Two-letter mode renders the first alphanumeric character of the first two word tokens for multi-word names ("BB Plugins" → `BP`, "bb-plugins-mateo" → `BP`) and the first two characters for single-word names ("taskboard" → `TA`); names with no alphanumeric content fall back to `?` per letter. One-letter mode keeps the current first-character behavior.
- [ ] [AC-3] The automatic badge color is a pure function of the rendered badge text: identical letters always map to the same `PROJECT_BADGE_PALETTE` color across reloads, clients, and machines; switching letter mode may recolor a badge; a rename may recolor it (accepted behavior change).
- [ ] [AC-4] A stored per-project color override still wins over the automatic color in both letter modes, and the existing settings editor keeps working.
- [ ] [AC-5] With `preferProjectIcon` on, a project whose default local source contains a recognized icon file renders that image in place of the letter badge in the sidebar; with it off, or when no candidate file exists, the letter badge renders.
- [ ] [AC-6] Icon resolution is fail-closed: it probes only a fixed allowlist of relative paths under the project's local source, enforces a size cap and an image-type allowlist, returns nothing for unreadable/oversized/foreign files, and never serves content outside the project root or for the personal project.
- [ ] [AC-UI-1] The sidebar badge and the Dockside Settings preview render two-letter badges, favicon badges, and letter fallback correctly in light and dark themes (screenshot evidence in live bb).

## Scope

- `plugins/dockside` only: badge rendering in `components/inbox/project-group.tsx`, letter/color derivation in `lib/project-colors.ts`, preference resolution in `lib/preferences.ts`, settings declarations and a new icon RPC in `server.ts`, a project-icon resolver in `lib/` (server-side file probing), the settings preview in `components/settings/dockside-settings.tsx`, unit tests under `test/`, and README updates.

## Non-goals

- bb's native sidebar or any other bb surface — plugins cannot change core chrome.
- Network-derived icons (GitHub org avatars, site favicon fetch). Repo files only.
- Per-project icon on/off overrides; the icon preference is global. The existing per-project *color* override remains the per-project knob.
- Icons for threads, child agents, or the personal project (no local source).
- Migrating or clearing stored color overrides — they persist untouched.

## Risks

- **Untrusted repo content**: an attacker-controlled repo could plant a hostile `favicon.svg`. Mitigation: fixed filename allowlist, byte-size cap, extension→MIME allowlist, and rendering strictly through `<img>` (SVG in `<img>` cannot execute script).
- **Path escape**: resolution probes only literal relative candidates joined under the project source path — no user-supplied path segments, no traversal.
- **Remote/offline sources**: a project source that is not a readable local path resolves to no icon and falls back to letters.
- **Behavior change**: automatic colors are re-keyed from project id to badge letters, so every automatic badge may change color once; overrides are unaffected.
- **Color collisions**: two different letter pairs can share a palette color — inherent to a 12-color palette, acceptable.

## Verification

- `bun run --filter 'bb-plugin-dockside' typecheck`
- `bun run --filter 'bb-plugin-dockside' test` — unit tests for letter derivation (multi-word initials, single-word, punctuation, unicode), letter-keyed color determinism, and icon resolution (fixture dirs: found, absent, oversized, wrong type, traversal attempt).
- Root `npm run check` before handoff.
- Live: `bb plugin build` + `bb plugin install ./plugins/dockside` + `bb plugin reload dockside`; screenshot the sidebar and settings preview in light and dark; toggle each new setting and confirm live update.

## Capability Deltas

See `deltas/dockside-project-appearance.md`.
