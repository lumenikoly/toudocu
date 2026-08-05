# UC-DOCS-04: Explore screen map

- Identifier: UC-DOCS-04
- Status: Completed
- Actor: Developer
- Module: MOD-SITE
- Priority: High
- Last updated: 2026-07-29

The developer explores user navigation and plays back documented
scripts in an offline portal.

## Inputs

- `screens/SC-*.md` documents with states and transitions;
- use cases with start and end screens;
- optional `screens/hotspots.json`;
- links to `SC-*` and `TR-*` from work items.

## Preconditions

- each screen has a unique `SC-*` and an existing module;
- each transition has a unique `TR-*`, use case and an existing target screen;
- the playable use case contains a start screen and at least one end screen.

## Main scenario

1. The developer runs `check` or `build`.
2. Docu-docu builds a single graph from screen documents and checks links,
   states, reachability, deadlocks and loops.
3. The portal creates a catalog, a DOM map with SVG links and a step-by-step tab
   passages on the use case page.
4. The developer filters the map by module, status or use case, scales and
   moves it, selects a screen or transition, and examines the connections. The card shows
   number of incoming and outgoing transitions.
5. The developer runs a use case and selects available actions.
6. The portal applies the target screen, status, error or message and saves
   history for `Назад` and `Сначала`.
7. On the final screen, the portal shows successful completion, restart, map and
   link to the original use case.

## Error scenarios

- main model error disables the problematic card, but not the rest
  documentation;
- incorrect flow does not start and shows the reasons;
- the missing preview is replaced with a stub;
- an incorrect hotspot is diagnosed, and the list of actions remains available.
- hidden hotspot appears when hover or focus, and the switch shows
  all zones constantly.

## Postconditions

HTML and ProjectReport schema v1 contain consistent screens, transitions,
playable scripts and traceability. The original Markdown is not modified.

## Business rules

- [BR-MODEL-004](../modules/model.md#br-model-004-screen-documents-are-the-source-of-the-graph) - screen documents are the source of the graph.
- [BR-SITE-005](../modules/site.md#br-site-005-screen-map-works-autonomously) - the map and step-by-step viewer work autonomously.

## Implementation

- [Screen Guide](../guides/screens.md)
- [Design model](../modules/model.md)
- [Static portal](../modules/site.md)
