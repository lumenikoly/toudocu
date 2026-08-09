# Docu-docu flow and screen model

Use this reference only for `FLOW-*`, `SC-*`, `TR-*`, screen states, or
`screens/hotspots.json`. Apply the general [document model](document-model.md)
and [semantic gate](semantic-gate.md) first when the operation changes sources.

## Flows

Use one `FLOW-*` document for one significant scenario, branch, error path, or
service interaction. For a product flow, list one or more existing `UC-*`
values in the `Scenario` field; Docu-docu creates the reverse relationship on
every listed use case. For a genuinely architectural flow, omit `Scenario` and
link an architecture document instead. Put concrete request sequences in
`flows/`; keep component, boundary, and dependency overviews in architecture,
and leave simple endpoint operations in API contracts. Mermaid node labels and
edges are visualization only: Docu-docu does not derive relationships from them.
Derive the diagram from the scenario; do not retrofit meaning onto a generic
start-to-finish graph.

## Screens and transitions

Use one `screens/SC-*.md` file for every significant screen. Metadata and the
outgoing transition table are the machine-readable source of truth:

```md
# SC-PUBLIC-HOME: Home

- Identifier: SC-PUBLIC-HOME
- Type: Page
- Module: MOD-PUBLIC
- Status: Planned
- Route: `/`

## Transitions

| ID | Use case | Action | Condition | Result |
|---|---|---|---|---|
| TR-PUBLIC-001 | UC-PUBLIC-01 | Open account | Signed in | SC-ACCOUNT-OVERVIEW |
```

Follow these constraints:

- use Screen, Page, Modal window, Panel, External page, or System state for Type;
- reference existing uppercase `MOD-*`, `UC-*`, and `SC-*` IDs only;
- treat routes as case-sensitive; duplicate routes are errors;
- declare start and terminal screens on the use case;
- describe self-transitions with a state, error, or explanation;
- keep previews local, inside repository root, and use only raster formats.

Transition Type may be navigation, error, redirect, return, or external. The
generated map distinguishes them by stroke pattern or geometry, not color
alone. Optional `screens/hotspots.json` uses percentage coordinates and must
reference an existing transition from the same screen.

Use the router only to confirm routes for screens already justified by product
navigation. Do not catalog technical redirects, wildcard or layout routes, or
internal component states as screens. Every transition must represent a
meaningful user action. Put the detailed behavior of one scenario in a
`FLOW-*` document instead of duplicating it in the product-wide map.

Do not maintain a separate Mermaid source or `screens/map.md`. Docu-docu derives
the catalog, SVG map, and playable flows from the screen documents.

Use cases and tasks can select screens with:

```md
- Screens: SC-AREA-START, SC-AREA-RESULT
```

Unknown screen IDs are errors. In templates, the whole-line placeholders
`OPTIONAL_SCREENS_METADATA`, `OPTIONAL_FLOW_METADATA`,
`OPTIONAL_ROUTE_METADATA`, and `OPTIONAL_COMPONENT_METADATA` mean: replace the
placeholder with one complete metadata line, or delete the line.
In a flow template, replace `OPTIONAL_USE_CASES_METADATA` with a complete
`Scenario` metadata line containing one or more `UC-*`, or delete the line for
an architectural flow. Replace `RELATED_DOCUMENT_LINKS` with one or more
Markdown links to the listed use cases or to the architecture document.
`FLOW_DIAGRAM` and `TRANSITION_ROWS` must be replaced with complete,
evidence-backed Mermaid source or table rows; templates provide no default
topology.
