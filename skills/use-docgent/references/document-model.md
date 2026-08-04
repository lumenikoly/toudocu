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

## Paths and document types

Only `index.md` is globally expected, and its absence is a warning. All other
types are optional.

| Path | Use when the project needs | Machine-readable behavior |
|---|---|---|
| `index.md` | An entry point and navigation | Project title and description |
| `status.md` | A current snapshot | Project status metadata; checklists are rejected |
| `roadmap.md` | Global scope and progress | Validates checklist IDs and derives linked `UC-*` state |
| `risks.md` | Risk tracking | Extracts `RISK-*` sections and mitigation progress |
| `modules/*.md` | Stable component boundaries and rules | Requires a unique `MOD-*` and validates relationships |
| `use-cases/*.md` | Observable actor behavior | Requires a unique `UC-*` and an existing module |
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
The ADR template includes context, decision, and consequences.

Docgent reports missing recommended sections as warnings. Use these sections
when they add information; do not create empty or speculative prose. If the
project does not need typed semantics, use the generic `document.md` template
outside the reserved typed paths.

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
