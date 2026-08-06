# Docu-docu document types

This reference helps choose a document by purpose. Docu-docu classifies a
document by its file location. Semantic selection starts with the question the
source must answer; only some machine-readable entity types require stable IDs.

## Quick selection

| Need to record | Use |
|---|---|
| Where to start reading about the project | [Project overview](#project-overview-and-status) |
| What is happening in the project now | [Current status](#project-overview-and-status) |
| Which global outcomes are planned | [Roadmap](#project-overview-and-status) |
| What value or result an actor receives | [Use case](#product-and-architecture) |
| How one significant scenario or interaction proceeds | [Process](#product-and-architecture) |
| How users move between significant screens | [Screen](#product-and-architecture) |
| Where a component boundary lies and which rules it protects | [Module](#product-and-architecture) |
| How the system is structured and why its parts relate this way | [Architecture](#product-and-architecture) |
| Why a durable technical decision was made | [ADR](#product-and-architecture) |
| What an interface, format, or protocol looks like | [Contract](#rules-procedures-and-explanations) |
| Which facts and options need to be found quickly | [Reference](#rules-procedures-and-explanations) |
| How to achieve a practical result | [Guide](#rules-procedures-and-explanations) |
| Which project rule is mandatory | [Standard](#rules-procedures-and-explanations) |
| How to perform an operational procedure safely | [Runbook](#rules-procedures-and-explanations) |
| Exactly what may be changed and how work is accepted | [Work item](#work-and-free-form-documents) |
| An unvalidated possibility or temporary observation | [Ideas or notes](#project-overview-and-status) |

## Project overview and status

| Type and location | Purpose | When to create | Do not use for |
|---|---|---|---|
| **Project overview** — `index.md` | Gives the title, concise description, and main entry points | Always: this is the documentation home page | A detailed contract, decision history, or complete roadmap |
| **Current status** — `status.md` | Shows a verified current snapshot: stage, version, and active focus | When readers need one current status | A desired future, work checklist, or release history |
| **Roadmap** — `roadmap.md` | Declares global outcomes and computed progress | When the project manages overall product scope through `UC-*`, `CON-*`, and `DLV-*` | A local task plan or unconfirmed ideas |
| **Risks** — `risks.md` | Collects `RISK-*`, likelihood, impact, and mitigations | When risks need explicit management | A defect list or implementation plan |
| **Ideas** — `ideas.md` | Keeps possible directions without promising implementation | For a capability or hypothesis not yet accepted | Roadmap, current status, or an approved requirement |
| **Notes** — `notes.md` | Preserves observations and temporary context | When information is useful but not yet durable knowledge | Normative rules, contracts, or architectural decisions |
| **Changelog** — root `CHANGELOG.md` | Describes changes in published versions | If the project maintains release history | Current status or a duplicate `docs/changelog.md` |

`status.md` does not accept task checklists. The global completion percentage
comes only from `roadmap.md`; a linked `UC-*` gets its state from the use case.

## Product and architecture

| Type and location | Purpose | When to create | Do not use for |
|---|---|---|---|
| **Architecture Overview** — `architecture/overview.md` | Defines the system boundary and maps architectural questions | Always; the overview links directly to every detailed architecture document | A complete account of all interactions, contracts, and local rules |
| **Architecture** — other `architecture/**/*.md` | Briefly answers one evidence-backed architectural question | When the answer concerns system structure, boundaries, or dependencies across parts | A request sequence, API format, procedure, ADR, or one module's rules |
| **Module** — `modules/*.md`, ID `MOD-*` | Records a stable responsibility boundary, business rules, and invariants | When that boundary matters to the product, owners, or linked scenarios | A mirror of a source directory or list of internal functions |
| **Use case** — `use-cases/*.md`, ID `UC-*` | Describes observable actor behavior and expected result | When behavior must link to a module, rules, screens, or roadmap | An implementation call graph or step-by-step operational procedure |
| **Process** — `flows/*.md`, ID `FLOW-*` | Visualizes one reusable scenario, error branch, or inter-system interaction | When a Mermaid diagram materially clarifies a use case or architecture | An exhaustive code diagram or replacement for textual requirements |
| **Screen** — `screens/SC-*.md`, IDs `SC-*` and `TR-*` | Describes a significant screen, its states, and outgoing user transitions | When the product needs a screen catalog, Screen Map, or traceability | A technical route, layout, redirect, or internal component state |
| **Architectural decision** — `decisions/*.md`, ID `ADR-*` | Preserves context, the decision made, and its consequences | When the decision and considered tradeoff were actually recorded | Retrospective justification of current code or a system description |

A special path determines `Document.Type`, but does not itself promise an
entity ID. ID uniqueness and explicit relationships are additionally validated
for `MOD-*`, `UC-*`, `FLOW-*`, `SC-*`/`TR-*`, `ADR-*`, and other types that
declare them. `status.md`, `roadmap.md`, `risks.md`, and architecture documents
have special behavior without their own unique entity ID. Do not create any of
these types merely to gain an extra portal page or remove a warning.

## Rules, procedures, and explanations

| Type and location | Purpose | When to create | Do not use for |
|---|---|---|---|
| **Contract** — `contracts/` | Defines an external interface, command, API, schema, or exchange format | When consumers need a precise, stable interaction boundary | A tutorial sequence, architectural explanation, or fact catalog |
| **Standard** — `quality/STD-*.md`, ID `STD-*` | Defines mandatory and verifiable project rules | When a rule has a scope, owner, and verification method | Non-binding advice or a one-off procedure |
| **Runbook** — `runbooks/RB-*.md`, ID `RB-*` | Gives a safe operational procedure with verification and rollback | Only for a real operation with a known environment and risk | A general guide, product flow, or invented procedure |
| **Guide** — `guides/` | Helps readers achieve a concrete result | For installation, setup, or a sequence of actions | An encyclopedic fact catalog or normative contract |
| **Reference** — `reference/` | Collects facts, options, and parameters for quick lookup | When readers understand the task and need an exact value or choice | Step-by-step teaching, decision rationale, or current status |

Detailed requirements for `STD-*`, `RB-*`, and custom sections are in the
[standards and runbooks guide](../guides/quality-runbooks.md). CLI and HTTP
formats remain in [contracts](../contracts/cli.md), not duplicated here.

## Work and free-form documents

| Type and location | Purpose | When to create | Do not use for |
|---|---|---|---|
| **Work item** — `work/TASK-*.md` | Defines authorized scope, result, acceptance criteria, and verification | For substantial work that needs a verifiable contract and agent or CI handoff | Every small request, a general roadmap, or an existing-feature description |
| **Defect** — `work/BUG-*.md` | Records an observable discrepancy and reproduction evidence; adds cause and regression verification when ready | When behavior truly differs from what is expected | Ideas, research work, or an unconfirmed bug hypothesis |
| **Custom section** — unknown top-level directory | Gives the project its own document group without new built-in semantics | When no built-in section expresses a durable domain | Disguising an existing built-in type |
| **Ordinary Markdown** — any other safe path | Communicates useful knowledge without a typed contract | When text, links, and basic validation suffice | Declaring machine relationships that Docu-docu must validate |

Active work items live in `work/`; completed and cancelled items may be moved by
a Docu-docu command to `work/archive/YYYY/`. The full contract is in the
[work-items guide](../guides/work-items.md).

### Document type and task type are different

Every `TASK-*` or `BUG-*` is a **Work item** document. Its `Type` field further
defines the nature of the work:

| `Type` value | Meaning |
|---|---|
| `Feature` | New or changed user behavior |
| `Bug` | Fix of an observed defect; uses a `BUG-*` ID and mandatory reproduction data |
| `Maintenance` | Technical maintenance without necessarily adding behavior |
| `Documentation` | Documentation change as the primary result |
| `Research` | Research with a verifiable result but no promised implementation |

Draft uses a reduced contract. From any non-Draft status, `Feature` links to a
use case; `Maintenance`, `Documentation`, and `Research` without one explain why
it does not apply. A non-Draft `Bug` needs a linked use case or an explicit Not
applicable explanation, a cause section, and regression coverage; a completed
bug must have an established cause. `Type` does not turn a work item into a
module, guide, or other document type.

## Supporting sources and manifests

- `screens/hotspots.json` adds percentage-based interactive areas to existing
  `SC-*` and `TR-*`; it is not an independent Markdown document.
- `screens/index.md` is the entry page for the built-in screen section and gets
  a separate machine type `screen-index`; it is not an `SC-*` entity.
- `quality/index.md` and `runbooks/index.md` define their section entry pages.
  An unknown section's manifest additionally declares `Type: Custom`, an owner,
  and a description.
- `screens/map.md` is an obsolete source. The catalog, Screen Map, and playable
  flows are built from `screens/SC-*.md`; no separate map should be maintained.
- Generated HTML, `report.json`, and the search index are derived output. They
  are not edited as sources of truth.

## Main selection rule

First formulate a useful reader question, then select the document type. If the
project does not need a stable ID, validated relationships, or special
presentation, leave the material as ordinary Markdown. Structural validation
confirms the declared contract, but does not make an unnecessary document useful.
