# Docu-docu document model

Use this reference when deciding whether a document should remain free-form or
participate in Docu-docu's typed knowledge model.

## Validation boundary

Validate only promises the documentation makes:

| Signal | Meaning | Result |
|---|---|---|
| Ordinary Markdown | Human-readable documentation | Render safely; report basic editorial warnings |
| Typed path such as `modules/` or `use-cases/` | Opt-in machine-readable entity | Validate its ID and explicit relationships |
| Stable ID or local link | Declared identity or relationship | Require uniqueness and a valid target |
| `roadmap.md` checklist item | Declared global scope | Require one supported stable ID |
| `task ready` | Read-only readiness request | Require the complete task schema even for Draft |
| `task verify --run` | Permission to execute repository commands | Apply the task-local validation gate before execution |

Errors protect safety, identity, relationships, and executable contracts.
Warnings describe editorial completeness, recognized statuses, and staleness.
Do not turn a warning into invented content merely to make a strict check pass.
Structural validation may define the serialization of an opted-in typed
contract. It does not decide which entities the product contains, which
relationships are meaningful, or whether the document should exist. Apply
[semantic-gate.md](semantic-gate.md) before the final structural check.

## Paths and document types

Only `index.md` is globally expected, and its absence is a warning. All other
types are optional.

| Path | Use when the project needs | Machine-readable behavior |
|---|---|---|
| `index.md` | An entry point and navigation | Project title and description |
| `status.md` | A current snapshot | Project status metadata; checklists are rejected |
| `roadmap.md` | Global scope and progress | Validates checklist IDs and derives linked `UC-*` state |
| `risks.md` | Risk tracking | Extracts `RISK-*` sections and mitigation progress |
| `ideas.md` | Feature ideas and future plans | Free-form; no required metadata or sections |
| `notes.md` | Notes, observations, and temporary context | Free-form; no required metadata or sections |
| `modules/*.md` | Stable component boundaries and rules | Requires a unique `MOD-*` and validates relationships |
| `use-cases/*.md` | Observable actor behavior | Requires a unique `UC-*` and an existing module |
| `flows/*.md` | A reusable visual process | Requires a unique `FLOW-*`, Mermaid, and a use-case or architecture relationship |
| `screens/SC-*.md` | A significant screen and its outgoing transitions | Parses metadata, states and `TR-*`; validates modules, routes and topology |
| `screens/hotspots.json` | Optional percentage-based interactive areas | Validates screen and transition references and geometry |
| `decisions/*.md` | Durable decisions | Requires a unique `ADR-*` |
| `quality/STD-*.md` | Enforceable project standards | Requires a unique `STD-*`; validates status and replacement links |
| `runbooks/RB-*.md` | Operational procedures | Requires a unique `RB-*`; derives review freshness |
| `work/TASK-*.md`, `work/BUG-*.md`, and yearly archive paths | Agent- or CI-readable work and terminal history | Requires exactly one work item, status-dependent fields, and terminal archive status |
| `architecture/overview.md` | Required architecture boundary and question map | Requires `Architecture Overview` and direct links to every detailed architecture document |
| Other `architecture/**/*.md` | One evidence-backed architectural question per document | Requires document type `Architecture`, one non-empty question, and a direct overview listing |
| `contracts/`, `guides/`, `reference/` | Specialized human documentation | Classifies and renders the document |
| Any other path | Free-form documentation | Renders safely without a typed entity contract |

When an unknown top-level directory contains Markdown, its `index.md` is a
custom-section manifest with `Type: Custom`, an owner, and a description. Its
H1 supplies the navigation title. Do not infer a typed category from filenames,
document count, or prose.

Use one H1 and a concise introduction when useful. These improve navigation but
are not reasons to invent project metadata. Narrative content may use any
language; recognized structural metadata and typed section aliases are Russian
or English.

## Stable IDs and relationships

When opting into a typed entity:

- give modules unique `MOD-*` IDs;
- give use cases unique `UC-*` IDs and reference an existing module;
- declare business rules as module headings such as
  `### BR-AREA-001: Title`;
- give decisions unique `ADR-*` IDs;
- give reusable flows unique `FLOW-*` IDs and link product flows to one or more
  requirements;
- give screens unique `SC-<AREA>-<NAME>` IDs and transitions unique
  `TR-<AREA>-<NUMBER>` IDs;
- give ordinary work items unique `TASK-AREA-NNN` IDs and bugs unique `BUG-AREA-NNN` IDs;
- keep IDs stable when titles or filenames change;
- update all references together when identity genuinely changes;
- use relative Markdown links that remain inside repository root.

For a `UC-*` roadmap item, Docu-docu derives effective completion from the linked
use-case status. `CON-*` and `DLV-*` retain their roadmap checkbox state. Other
checklists do not contribute to global progress.

## Typed-document guidance

The module template includes purpose, code location, boundaries, business
rules, invariants, stable interfaces, and related use cases. The use-case
template includes its main scenario, postconditions, rules, and implementation.
The flow template contains a Mermaid visualization and explicit links to its
requirements or architecture source. A product flow may list one or more
`UC-*` values in `Scenario`; Docu-docu builds both the `FLOW → UC` list and the
reverse `UC → FLOW` relationships. Each screen template contains that screen's
metadata, states and outgoing transitions; Docu-docu derives the catalog, map and
playable flows from those files. The ADR template includes context, decision,
and consequences.

Docu-docu reports missing recommended sections as warnings. Use these sections
when they add information; do not create empty or speculative prose. If the
project does not need typed semantics, use the generic `document.md` template
outside the reserved typed paths.

Common schema-driven anti-patterns include:

| Document | Reject when |
|---|---|
| Module | It mirrors a directory without a stable product or ownership boundary |
| Use case | It restates functions or routes without observable actor behavior |
| Flow | Its nodes are copied from code structure rather than one reusable scenario |
| Screen model | Its screens or transitions are derived from router entries instead of product navigation |
| ADR | No durable decision or considered tradeoff can be evidenced |
| Roadmap or status | Desired work is presented as current fact or global scope is inferred from local checklists |
| Task | Scope, criteria, or commands are invented to complete the task schema |

## Flows and screen maps

Use one `FLOW-*` document for one significant scenario, branch, error path, or
service interaction. For a product flow, list one or more existing `UC-*`
values in the `Scenario` field; Docu-docu creates the reverse relationship on
every listed use case. For a genuinely architectural flow, omit `Scenario` and
link an architecture document instead. Put concrete request sequences in
`flows/`; keep component, boundary, and dependency overviews in architecture,
and leave simple endpoint operations in API contracts. Mermaid node labels and
edges are visualization only: Docu-docu does not derive relationships from them.
Derive the diagram from the scenario; do not start from a generic
start-to-finish graph and retrofit meaning.

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
the catalog, SVG map and playable flows from the screen documents.

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
`FLOW_DIAGRAM` and `TRANSITION_ROWS` must be replaced with complete
evidence-backed Mermaid source or table rows; templates do not provide a
default topology.

## Work-item contract

Use one work item per `work/TASK-*.md` or `work/BUG-*.md`. Work items are
intentionally stricter because their commands may be executed.

For `Draft`/`Черновик`, require valid Status, Type, and a non-empty Result.

For every non-draft status, also require:

- an existing module;
- Scope;
- Out of scope;
- Acceptance criteria;
- Plan;
- Verification;
- Documentation impact.

Feature tasks require an existing use case. Maintenance,
Documentation, and Research tasks without a use case require a non-empty
Use-case omission reason.

Bug work items use `BUG-*` and require severity, priority, reproducibility,
regression, module, use case, owner, and updated date. They require Symptom,
Expected behavior, Actual behavior, and either Steps to reproduce or Evidence
even in Draft. Ready+ bugs additionally require Cause, Scope, Out of scope,
numbered Plan, Acceptance criteria, Verification, regression-test coverage,
and Documentation impact. A technical bug may set Use case to Not applicable
only with a non-empty Relationship to user behavior section.

Tasks may declare an optional `Flow`/`Process` field with an existing `FLOW-*`.
It adds the flow document to task context but does not replace the use case or
acceptance criteria.

Tasks may also declare `Screens` and `Transitions` with existing `SC-*` and
`TR-*` IDs. Task context includes those screen records, incident transitions,
and matching screen documents. These links do not replace task scope or
acceptance criteria.

Checkboxes are allowed in both acceptance criteria and plan. Start every
acceptance criterion with one unique `AC-*` and give it exactly one verification
entry. Plan items may be numbered steps, bullets, or checkboxes and do not
require `AC-*` identifiers or verification entries:

Bug plans are the exception: they use numbered steps without checkboxes, so a
bug document keeps checkboxes only in acceptance criteria.

```md
## Acceptance criteria

- [ ] `AC-01` An invalid token is rejected.

## Verification

- `AC-01` -> `go test ./internal/auth -run TestInvalidToken`
```

Completed tasks require all criteria checked, plus `ALL` and `DOCS` targets and
completed dependencies. Blocked tasks require a Blocker section; cancelled
tasks require a Cancellation reason.

Tasks may explicitly list `Standards`/`Стандарты` and
`Affected runbooks`/`Затронутые runbooks`. Task context includes those `STD-*`
and `RB-*` records and documents without matching scope globs automatically.
When Standards is non-empty, readiness and full verification also require
exactly one `QUALITY` mapping whose command is declared by the task.

Keep active tasks in `work/`. Only Done and Cancelled tasks belong under
`work/archive/YYYY/`; malformed archive paths and nonterminal archived tasks are
errors. IDs and dependencies are global across active and archived tasks, and
task-number allocation scans both locations.

Treat code spans in Scope as repository-relative paths. Each path or glob must
exist and remain inside `--repository-root`.

## Supported Markdown

Prefer headings, paragraphs, emphasis, links, safe raster images, blockquotes,
lists, task lists, tables, inline code, and fenced code. Do not use raw HTML,
active SVG/XML/HTML assets, JavaScript URLs, or syntax that depends on full
CommonMark. Fenced code is not parsed as headings, links, or tasks.
