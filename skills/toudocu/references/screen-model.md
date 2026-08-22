# Toudocu flow and screen model

Use this reference only for `FLOW-*`, `SC-*`, `TR-*`, screen states, or
`screens/hotspots.json`. Apply the general [document model](document-model.md),
[reader-first writing gate](writing-quality.md), and
[semantic gate](semantic-gate.md) first when the operation changes sources.

## Flows

Use one `FLOW-*` document for one significant scenario, branch, error path, or
service interaction. For a product flow, list one or more existing `UC-*`
values in the `Scenario` field; Toudocu creates the reverse relationship on
every listed use case. For a genuinely architectural flow, omit `Scenario` and
link an architecture document instead. Put concrete request sequences in
`flows/`; keep component, boundary, and dependency overviews in architecture,
and leave simple endpoint operations in API contracts.

Mermaid node labels and edges are visualization only: Toudocu does not derive
relationships from them. Derive the diagram from the scenario; do not retrofit
meaning onto a generic start-to-finish graph.

### Reader-facing diagram labels

Treat visible Mermaid text as documentation prose:

- keep node IDs and Mermaid syntax stable, but write visible labels, notes, and
  arrow text in the document's target language;
- in a user flow, name the user action, business event, visible state, or system
  outcome rather than the variable, handler, transport event, or function that
  implements it;
- phrase decisions as natural questions, for example `Is joining allowed?`, not
  `canJoin = true?`;
- put an exact event, command, status, or error token after the human meaning
  only when contract traceability matters, for example
  `Create the participant (REGISTER)`;
- do not mix languages inside a label unless the preserved text is an exact
  identifier, product name, protocol term, or another token that must remain
  unchanged;
- in component and sequence diagrams, exact participant names may remain
  technical, but messages must still state the action or result clearly.

A diagram must remain understandable to its intended reader without opening the
source code. It may be precise and technical, but it must not be a transcription
of implementation symbols.

## Screens and transitions

Use one `screens/SC-*.md` file for every significant screen. Metadata and the
outgoing transition table are the machine-readable source of truth:

```md
<!-- toudocu
version: 1
id: SC-PUBLIC-HOME
screenKind: page
module: MOD-PUBLIC
status: planned
route: /
-->

# SC-PUBLIC-HOME: Home

## Transitions

<!-- toudocu:table transitions columns=id,useCase,action,condition,target,kind -->
| ID | Use case | Action | Condition | Result | Type |
|---|---|---|---|---|---|
| TR-PUBLIC-001 | UC-PUBLIC-01 | Open account | Signed in | SC-ACCOUNT-OVERVIEW | navigation |
```

Follow these constraints:

- use `screen`, `page`, `modal`, `panel`, `external`, or `system` for `screenKind`;
- reference existing uppercase `MOD-*`, `UC-*`, and `SC-*` IDs only;
- treat routes as case-sensitive; duplicate routes are errors;
- declare start and terminal screens on the use case;
- describe self-transitions with a state, error, or explanation;
- keep previews local, inside repository root, and use only raster formats.

Transition `kind` is explicitly `navigation`, `error`, `redirect`, `return`, or `external`. The
generated map distinguishes them by stroke pattern or geometry, not color
alone. Optional `screens/hotspots.json` uses percentage coordinates and must
reference an existing transition from the same screen.

Write `Action`, `Condition`, `Result`, state names, and user-visible messages in
natural target-language phrases. Keep IDs in their dedicated columns. Mention a
contract field, event, or error code in a descriptive cell only when the reader
needs that exact value, and explain its meaning in the same row or neighboring
prose.

Use the router only to confirm routes for screens already justified by product
navigation. Do not catalog technical redirects, wildcard or layout routes, or
internal component states as screens. Every transition must represent a
meaningful user action or observable system outcome. Put the detailed behavior
of one scenario in a `FLOW-*` document instead of duplicating it in the
product-wide map.

Do not maintain a separate Mermaid source or `screens/map.md`. Toudocu derives
the catalog, SVG map, and playable flows from the screen documents.

Use cases and tasks can select screens with:

```md
screens: SC-AREA-START, SC-AREA-RESULT
```

Unknown screen IDs are errors. In templates, the whole-line placeholders
`OPTIONAL_SCREENS_METADATA`, `OPTIONAL_FLOW_METADATA`,
`OPTIONAL_ROUTE_METADATA`, and `OPTIONAL_COMPONENT_METADATA` mean: replace the
placeholder with one complete canonical annotation line, or delete the line.

In a flow template, replace `OPTIONAL_USE_CASES_METADATA` with a complete
`useCase` annotation line containing one or more `UC-*`, or delete the line for
an architectural flow. Replace `RELATED_DOCUMENT_LINKS` with one or more
Markdown links to the listed use cases or to the architecture document.
`FLOW_DIAGRAM` and `TRANSITION_ROWS` must be replaced with complete,
evidence-backed Mermaid source or table rows; templates provide no default
topology or wording.
