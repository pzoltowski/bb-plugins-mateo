# Taskboard Browser Specification

## Purpose

Define the restrained, responsive List/detail/filter behavior adapted for
Taskboard while preserving its full-width Kanban mode.

## Requirements

### Requirement: Restrained responsive List presentation

Taskboard SHALL render List rows as compact flat content with semantic state
shape and restrained color, neutral sticky group headings, stable aligned
metadata, and a readable capped List measure. Assigned people in List rows and
Kanban cards SHALL use compact, accessible initials avatars whose
provider-neutral tone is derived deterministically from the normalized assignee
name. The avatar SHALL retain a 20px footprint, theme-safe contrast, a visible
ring, and the full assignee name for assistive technology and tooltip
disclosure. Unassigned work SHALL continue to omit the marker. List rows and
Kanban cards SHALL identify the tracker-side project (`WorkItem.project`) with
a ghost-text indicator — the registered Cube glyph followed by the project
name in the shared muted meta color, without a pill container or per-project
color — whenever the value is non-empty. Kanban SHALL retain full available
width and existing movement behavior.

#### Scenario: Wide List and Kanban

- **WHEN** the user switches a wide project board between List and Kanban
- **THEN** List content is capped near 56rem while Kanban uses the full board
  width
- **AND** neither mode loses provider status names or actions

#### Scenario: Scan assigned rows

- **GIVEN** several visible work items have assignees
- **WHEN** the user scans List or Kanban
- **THEN** each assigned item shows a crisp 20px initials avatar
- **AND** the same assignee uses the same tone everywhere
- **AND** row/card geometry does not grow

#### Scenario: Identify without color

- **GIVEN** an assignee avatar is visible
- **WHEN** assistive technology reads the marker or the user opens its tooltip
- **THEN** Taskboard exposes `Assigned to <full name>`
- **AND** initials or palette color are not the sole identity signal

#### Scenario: Identify the tracker project in List

- **GIVEN** a visible work item has a non-empty `project` value
- **WHEN** the item renders in List
- **THEN** the row's trailing meta shows the Cube glyph followed by the
  project name in muted ghost text
- **AND** the row's accessible label names the project alongside priority and
  assignee

#### Scenario: Identify the tracker project in Kanban

- **GIVEN** a visible work item has a non-empty `project` value
- **WHEN** the item renders as a Kanban card
- **THEN** the card's bottom meta row shows the Cube glyph followed by the
  project name in muted ghost text
- **AND** the assignee mark remains right-aligned and the card keeps existing
  movement behavior

#### Scenario: Item without a tracker project

- **GIVEN** a work item has a null or empty `project` value
- **WHEN** it renders in List or Kanban
- **THEN** no project indicator, empty slot, or extra gap appears
- **AND** all other metadata is unchanged

#### Scenario: Preserve provider behavior

- **GIVEN** the item is GitHub, Linear, or Jira work
- **WHEN** Taskboard renders the assignee marker
- **THEN** it uses the existing assignee display string without fetching an
  avatar or changing provider, filtering, navigation, or mutation contracts

### Requirement: Collapsible terminal groups

Finished and cancelled groups SHALL start collapsed, expose an accessible
toggle, remember explicit toggles per project, and open temporarily during
search.

#### Scenario: Search a collapsed Done group

- **WHEN** a matching issue exists inside a collapsed Done group and the user
  enters a search query
- **THEN** the group opens for the search result without destroying the saved
  collapsed preference after search clears

### Requirement: Constrained filter control

Constrained Taskboard surfaces SHALL replace the horizontally crowded chip row
with one compact filter control that exposes every enabled facet and clearly
indicates active selections. Source, State group, Status, Assignee, Priority,
Project, and Labels SHALL use one consistent, decorative icon vocabulary across
wide filter chips, compact section headings, and filter configuration cards.
Text labels, checked state, active counts, search, Clear, persistence, and
keyboard behavior SHALL remain authoritative and unchanged.

#### Scenario: Pinned right panel

- **WHEN** Taskboard renders beside a chat at constrained width
- **THEN** one filter control opens the enabled facets with saved options checked
- **AND** each named section has its canonical decorative icon
- **AND** search, Clear, and List/Kanban behavior remain reachable

#### Scenario: Wide project board

- **WHEN** Taskboard renders the wide filter chip row
- **THEN** each chip uses the same icon and label as its compact menu section
- **AND** choosing or clearing a filter behaves exactly as before

#### Scenario: Configure visible filters

- **WHEN** the user opens Manage and reviews visible filters
- **THEN** each filter card uses its canonical icon, label, and description
- **AND** saving the configuration writes the same filter-field values as before

### Requirement: Quiet detail conversation hierarchy

Task detail SHALL use hairline-separated sections and a single comment rail or
divider hierarchy instead of a separate bordered card around every comment.

#### Scenario: Several comments

- **WHEN** an issue contains several comments
- **THEN** comments read as one chronological conversation with author/time and
  Markdown content preserved

### Requirement: Accessible constrained filters and creation feedback

The constrained Taskboard filter menu SHALL make its visible value-search field
keyboard reachable and prevent provider values from creating horizontal
scrolling. Provider creation metadata failures SHALL expose the safe underlying
message through an announced alert while retaining Retry.

#### Scenario: Keyboard-filter a constrained board

- **WHEN** a keyboard user opens the constrained Filters menu
- **THEN** focus moves to the visible filter-value search input
- **AND** long values wrap or clip without horizontal scrolling

#### Scenario: Creation metadata fails

- **WHEN** provider metadata cannot load and Create is disabled
- **THEN** the dialog announces the safe provider error as an alert
- **AND** exposes the existing Retry action

#### Scenario: Restore differently-cased facet values

- **WHEN** a persisted selection differs only by case from a fresh option ID
- **THEN** the visible option renders checked with one canonical value
- **AND** toggling it off removes the filter completely

### Requirement: Provider-native value fidelity

Provider list/detail mapping SHALL retain every provider value that Taskboard
allows the user to submit, up to the declared field-selection limit.

#### Scenario: Create a Linear issue with many labels

- **WHEN** Taskboard accepts up to 100 Linear label selections
- **THEN** subsequent Linear issue payloads request at least 100 labels
