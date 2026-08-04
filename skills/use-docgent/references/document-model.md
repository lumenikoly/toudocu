# Docgent document model

Use this reference when deciding whether a document should remain free-form or
participate in Docgent's typed knowledge model.

## Validation boundary

Validate only promises the documentation makes:

| Signal | Meaning | Result |
|---|---|---|
| Ordinary Markdown | Human-readable documentation | Render safely; report basic editorial warnings |
| Typed path such as `modules/` or `use-cases/` | Opt-in machine-readable entity | Validate its ID and explicit relationships |
| Stable ID or local link | Declared identity or relationship | Require uniqueness and a valid target |
| `roadmap.md` checklist item | Declared global scope | Require one supported stable ID |
| Non-draft `TASK-*` | Executable work contract | Require the complete task schema |
| `task check` | Permission to execute repository commands | Apply the task validation gate before execution |

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
| `screens/map.md` | A product-wide screen graph | Parses the screen catalog and transitions; validates `SC-*`, modules, routes, and topology |
| `screens/SC-*.md` | Detailed behavior of a significant screen | Requires a catalogued `SC-*`; computed transitions stay in the central map |
| `decisions/*.md` | Durable decisions | Requires a unique `ADR-*` |
| `work/TASK-*.md` | Agent- or CI-readable work | Requires exactly one task and status-dependent fields |
| `architecture/`, `contracts/`, `guides/`, `reference/` | Specialized human documentation | Classifies and renders the document |
| Any other path | Free-form documentation | Renders safely without a typed entity contract |

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
- give reusable flows unique `FLOW-*` IDs and link them to requirements;
- give screens unique `SC-<AREA>-<NAME>` IDs and keep transitions in `screens/map.md`;
- give work items unique `TASK-AREA-NNN` IDs;
- keep IDs stable when titles or filenames change;
- update all references together when identity genuinely changes;
- use relative Markdown links that remain inside repository root.

For a `UC-*` roadmap item, Docgent derives effective completion from the linked
use-case status. `CON-*` and `DLV-*` retain their roadmap checkbox state. Other
checklists do not contribute to global progress.

## Typed-document guidance

The module template includes purpose, code location, boundaries, business
rules, invariants, stable interfaces, and related use cases. The use-case
template includes its main scenario, postconditions, rules, and implementation.
The flow template contains a Mermaid visualization and an explicit requirements
link. The screen-map template contains the catalog and transitions; the screen
template adds details without duplicating the graph. The ADR template includes
context, decision, and consequences.

Docgent reports missing recommended sections as warnings. Use these sections
when they add information; do not create empty or speculative prose. If the
project does not need typed semantics, use the generic `document.md` template
outside the reserved typed paths.

Common schema-driven anti-patterns include:

| Document | Reject when |
|---|---|
| Module | It mirrors a directory without a stable product or ownership boundary |
| Use case | It restates functions or routes without observable actor behavior |
| Flow | Its nodes are copied from code structure rather than one reusable scenario |
| Screen map | Its catalog is derived from router entries instead of product navigation |
| ADR | No durable decision or considered tradeoff can be evidenced |
| Roadmap or status | Desired work is presented as current fact or global scope is inferred from local checklists |
| Task | Scope, criteria, or commands are invented to complete the task schema |

## Flows and screen maps

Use a `FLOW-*` document for the detailed behavior of one reusable scenario.
Link it to an existing use case or architecture document. Mermaid node labels
and edges are visualization only: Docgent does not derive relationships from
them. Derive the diagram from the scenario; do not start from a generic
start-to-finish graph and retrofit meaning.

Use `screens/map.md` for the product-wide navigation graph. Its two tables are
the machine-readable source of truth for the declared graph, while product
information architecture and user journeys determine which screens belong in
it:

```md
## Screen catalog

| ID | Screen | Module | Type | Role | Route | Status | Errors |
|---|---|---|---|---|---|---|---|
| SC-PUBLIC-HOME | Home | MOD-PUBLIC | page | entry | `/` | Planned | — |
| SC-ACCOUNT-OVERVIEW | Account overview | MOD-ACCOUNT | page | terminal | `/account` | Planned | — |

## Transitions

| From | Action | Condition | To | Type |
|---|---|---|---|---|
| SC-PUBLIC-HOME | Open account | Signed in | SC-ACCOUNT-OVERVIEW | navigation |
```

Follow these constraints:

- use `page` or `modal` for Type;
- use `normal`, `entry`, `terminal`, or `entry-terminal` for Role;
- use `navigation` or `redirect` for transition Type;
- use a blank cell or `—` for an absent route, condition, or error list;
- declare at least one entry screen and mark valid exits as terminal;
- reference existing uppercase `MOD-*` and `SC-*` IDs only;
- treat routes as case-sensitive; duplicate routes produce a warning;
- do not use external URLs as transition targets in the v1 graph;
- use `ERR-*` values for catalog filtering; Docgent does not resolve them
  against a separate error catalog.

Use the router only to confirm routes for screens already justified by product
navigation. Do not catalog technical redirects, wildcard or layout routes, or
internal component states as screens. Every transition must represent a
meaningful user action. Put the detailed behavior of one scenario in a
`FLOW-*` document instead of duplicating it in the product-wide map.

Do not add or edit a Mermaid fence in `screens/map.md`. Docgent generates the
`flowchart LR` visualization from the catalog and transition tables.

Detailed `screens/SC-*.md` documents are optional. When present, repeated
module, status, and route metadata must match the catalog. Do not duplicate
transition tables in screen documents.

Use cases and tasks can select screens with:

```md
- Screens: SC-AREA-START, SC-AREA-RESULT
```

Unknown screen IDs are errors. In templates, the whole-line placeholders
`OPTIONAL_SCREENS_METADATA`, `OPTIONAL_FLOW_METADATA`,
`OPTIONAL_ROUTE_METADATA`, and `OPTIONAL_COMPONENT_METADATA` mean: replace the
placeholder with one complete metadata line, or delete the line.
`FLOW_DIAGRAM`, `SCREEN_ROWS`, and `TRANSITION_ROWS` must be replaced with the
complete evidence-backed Mermaid source or table rows; the templates do not
provide a default topology.

## Work-item contract

Use one task per `work/TASK-*.md`. Tasks are intentionally stricter because
their commands may be executed.

For `Draft`/`Черновик`, require valid Status, Type, and a non-empty Result.

For every non-draft status, also require:

- an existing module;
- Scope;
- Out of scope;
- Acceptance criteria;
- Plan;
- Verification;
- Documentation impact.

Feature and Bug tasks require an existing use case. Maintenance,
Documentation, and Research tasks without a use case require a non-empty
Use-case omission reason.

Tasks may declare an optional `Flow`/`Process` field with an existing `FLOW-*`.
It adds the flow document to task context but does not replace the use case or
acceptance criteria.

Tasks may also declare `Screens` with one or more existing `SC-*` IDs. Task
context then includes those screen records, their incident transitions,
`screens/map.md`, and matching screen documents. Screens do not replace task
scope or acceptance criteria.

Put checkboxes only in acceptance criteria. Start every criterion with one
unique `AC-*` and give it exactly one verification entry:

```md
## Acceptance criteria

- [ ] `AC-01` An invalid token is rejected.

## Verification

- `AC-01` -> `go test ./internal/auth -run TestInvalidToken`
```

Completed tasks require all criteria checked, plus `ALL` and `DOCS` targets and
completed dependencies. Blocked tasks require a Blocker section; cancelled
tasks require a Cancellation reason.

Treat code spans in Scope as repository-relative paths. Each path or glob must
exist and remain inside `--repository-root`.

## Supported Markdown

Prefer headings, paragraphs, emphasis, links, safe raster images, blockquotes,
lists, task lists, tables, inline code, and fenced code. Do not use raw HTML,
active SVG/XML/HTML assets, JavaScript URLs, or syntax that depends on full
CommonMark. Fenced code is not parsed as headings, links, or tasks.
