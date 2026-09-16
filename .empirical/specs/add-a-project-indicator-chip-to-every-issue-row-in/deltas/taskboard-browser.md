# Capability Delta: Taskboard Browser

## MODIFIED Requirements

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
