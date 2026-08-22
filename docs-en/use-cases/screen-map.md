<!-- toudocu
id: UC-DOCS-04
status: done
priority: high
module: MOD-SITE
screens: SC-SITE-USE-CASE, SC-SITE-SCREEN-MAP
startScreen: SC-SITE-USE-CASE
terminalScreens: SC-SITE-SCREEN-MAP
updated: 2026-08-12
-->

# UC-DOCS-04: Explore the Screen Map


The developer explores user navigation and plays documented scenarios in the
standalone portal.

## Inputs

- `screens/SC-*.md` documents with states and transitions;
- use cases with start and terminal screens;
- optional `screens/hotspots.json`;
- `SC-*` and `TR-*` references from work items.

<!-- toudocu:section prerequisites -->
## Preconditions

- each screen has a unique `SC-*` and an existing module;
- each transition has a unique `TR-*`, a use case, and an existing target screen;
- a playable use case has a start screen and at least one terminal screen.

<!-- toudocu:section main-scenario -->
## Main scenario

1. The developer runs `check` or `build`.
2. Toudocu builds one graph from the screen documents and validates links,
   states, reachability, dead ends, and cycles.
3. The portal creates a catalog, a DOM map with SVG connections, and a
   step-by-step playback tab on the use-case page.
4. The developer filters the map by module, status, or use case; zooms and pans
   it; selects a screen or transition; and explores its relationships. A card
   shows the number of incoming and outgoing transitions.
5. The developer starts a use case and selects available actions.
6. The portal applies the target screen, state, error, or message and retains
   history for `Back` and `Start over`.
7. On a terminal screen, the portal shows successful completion, restart, the
   map, and a link to the source use case.

## Error scenarios

- a main-model error disables the affected map but not the rest of the documentation;
- an invalid flow does not start and displays the reasons;
- a missing preview is replaced with a placeholder;
- an invalid hotspot is diagnosed while the action list remains available;
- a hidden hotspot appears on hover or focus, and a toggle can keep all areas visible.

<!-- toudocu:section postconditions -->
## Postconditions

The HTML and ProjectReport schema v1 contain consistent screens, transitions,
playable scenarios, and traceability. The source Markdown is unchanged.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] HTML and `ProjectReport` schema v1 contain consistent screens,
  transitions, playable scenarios, and traceability.
- [x] Building the map leaves source Markdown unchanged.

<!-- toudocu:section business-rules -->
## Business rules

- [BR-MODEL-004](../modules/model.md#br-model-004-screen-documents-are-the-source-of-the-graph) — screen documents are the graph source.
- [BR-SITE-005](../modules/site.md#br-site-005-the-screen-map-works-autonomously) — the map and step-by-step viewer work autonomously.

<!-- toudocu:section implementation -->
## Implementation

- [Screen guide](../guides/screens.md)
- [Project model](../modules/model.md)
- [Static portal](../modules/site.md)
