# Plan: Dockside project badge upgrade

Ordered executable steps. Each step lands compilable; tests run after the
pure-logic steps and again at the end.

## Steps

1. **Letter derivation + letter-keyed colors** — `lib/project-colors.ts`:
   add `projectBadgeText(name, count)`, re-key `automaticProjectColor` onto
   the badge text, change `projectBadgePresentation(badgeText, override)`.
   Update `project-group.tsx` + `dockside-settings.tsx` call sites.
2. **Preferences + settings declarations** — `lib/preferences.ts`
   (`badgeLetterCount`, `preferProjectIcon`, `BADGE_LETTER_OPTIONS`) and
   `server.ts` `bb.settings.define` (`badgeLetters` select default
   "Two letters", `preferProjectIcon` boolean default true).
3. **Icon resolver** — new `lib/project-icons.ts`: fixed candidate allowlist
   under the project source path, `app.json` `expo.icon` support, 256 KiB cap,
   extension→MIME allowlist, fail-closed `resolveProjectIcon` +
   `resolveAllProjectIcons` over `bb.sdk.projects.list()` results.
4. **RPC + channel** — `server.ts`: `listProjectIcons` in
   `docksideRpcContract`, `PROJECT_ICON_CHANNEL = "project-icons"`, handler
   returning bounded `{ projectId, dataUrl }[]`.
5. **Frontend wiring** — new `hooks/use-project-icons.ts` (mirror
   `use-project-colors`), `thread-inbox.tsx` passes `projectIcons`,
   `project-group.tsx` renders `<img>` when `preferProjectIcon && icon`.
6. **Settings preview** — `dockside-settings.tsx`: badge previews honor the
   letter count and show icon mode; footer summary mentions the new state.
7. **Tests** — extend `test/project-colors.test.ts` (letters + keyed color),
   `test/preferences.test.ts` (new defaults), `test/settings-contract.test.ts`
   (new keys/RPC/channel); new `test/project-icons.test.ts` (resolver
   fixtures).
8. **Docs** — README Configuration section gains the two settings and the
   favicon rules.
9. **Verify** — `bun run --filter 'bb-plugin-dockside' typecheck`,
   `bun run --filter 'bb-plugin-dockside' test`, root `npm run check`,
   `bb plugin build ./plugins/dockside` (with `BB_CLI` cleared per repo
   rules), then live `bb plugin install`/`reload` + sidebar/settings
   screenshots in light and dark.

## Dependency notes

- Steps 1–2 are pure and unblock the mockup-accurate render path.
- Step 3 has no frontend dependency; 4–5 deliver it to the UI.
- The settings-contract test greps source text, so declarations (2, 4) must
  land before test updates (7).
