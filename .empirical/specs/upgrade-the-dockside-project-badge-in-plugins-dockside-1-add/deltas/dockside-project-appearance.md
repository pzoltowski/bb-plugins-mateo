# Dockside Project Appearance Delta

## Purpose

Extend Dockside's project badge from a single fixed letter into a configurable
project avatar: one or two letters, a color that belongs to the rendered
letters, and an opt-out preference for the repository's own favicon.

## MODIFIED Requirements

### Requirement: Project letter badges have stable accessible colors

Dockside SHALL assign every project letter badge a deterministic background
from a curated palette derived from the **rendered badge letters**, not the
project id or raw display name. It SHALL derive a readable foreground color
and SHALL preserve the existing project name, count, controls, order, and
thread-state semantics.

#### Scenario: Same letters, same color

- **GIVEN** two projects render identical badge letters
- **WHEN** neither has a stored color override
- **THEN** both badges use the same automatic background color on every client
- **AND** the mapping survives reloads and reinstalls

#### Scenario: Project is renamed

- **GIVEN** a project uses its automatic badge color
- **WHEN** its display name changes so the rendered badge letters change
- **THEN** the badge letters follow the new name
- **AND** its automatic background color follows the new letters (changed from
  id-keyed stability)

## ADDED Requirements

### Requirement: Badge letter count is configurable

Dockside SHALL offer a plugin setting choosing one-letter or two-letter
project badges, defaulting to two letters. The choice SHALL apply to every
project badge and to badge previews in settings without a reload.

#### Scenario: Two-letter derivation

- **WHEN** the letter count is two
- **THEN** a multi-word name renders the first alphanumeric character of its
  first two word tokens ("BB Plugins" → `BP`, "bb-plugins-mateo" → `BP`)
- **AND** a single-word name renders its first two characters ("taskboard" → `TA`)
- **AND** a name with fewer than two alphanumeric characters pads to `?`

#### Scenario: User switches to one letter

- **WHEN** the user selects one letter in settings
- **THEN** every badge renders the first alphanumeric character of the name
- **AND** automatic colors re-derive from the single letters

### Requirement: Repository favicon preferred when present

Dockside SHALL offer a plugin setting, default on, that replaces the letter
badge with an image when the project's default local source directory contains
a recognized favicon/icon file. When the setting is off, no candidate exists,
or resolution fails, the badge SHALL fall back to letters.

#### Scenario: Project with a favicon

- **GIVEN** project A's local source contains `favicon.svg`
- **WHEN** the preference is on
- **THEN** project A's sidebar badge shows the image
- **AND** project B without a candidate file keeps its letter badge

#### Scenario: Preference disabled

- **WHEN** the user turns the preference off
- **THEN** every badge renders letters even where an icon file exists

### Requirement: Icon resolution fails closed

Dockside SHALL probe only a fixed allowlist of relative candidate paths under
the project's local source, SHALL enforce a byte-size cap and an image-type
allowlist, SHALL bound RPC payloads, and SHALL return no icon for the personal
project, non-local sources, unreadable files, or disallowed types.

#### Scenario: Oversized or foreign file

- **WHEN** a candidate file exceeds the size cap, has a non-image type, or
  resolves outside the source directory
- **THEN** the server returns no icon for that project and the badge falls
  back to letters

#### Scenario: Icon appears or disappears

- **GIVEN** a project previously had no icon
- **WHEN** a recognized icon file is added and icons are re-fetched
- **THEN** the badge shows the image without manual cache clearing
