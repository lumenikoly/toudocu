---
name: toudocu
description: Use this skill when a request creates, changes, reviews, translates, validates, or publishes Toudocu-managed project documentation; when code or product changes may make that documentation inaccurate; or when working with MOD-*, UC-*, FLOW-*, SC-*, TR-*, ADR-*, STD-*, RB-*, TASK-* entities, Toudocu CLI, portal, or task workflows, or explicit $toudocu commands. Produce evidence-backed, reader-first text in the selected document language. Do not use it for code-only work with no documentation impact. Never infer initialization or run `task verify --run` without explicit authorization.
---

# Toudocu

Toudocu maintains source Markdown, explicit relationships, and safe repository
paths. Generated portals and reports are outputs, not documentation sources.

## Route the request

Read the one operation reference selected by this table. Load additional model
or review references only when the request meets their conditions below.

| Operation | Reference | Changes files? | Authority |
|---|---|---:|---|
| `$toudocu init` | [references/init.md](references/init.md) | Yes | Only when the user explicitly invokes `$toudocu init` |
| `$toudocu refresh` | [references/refresh.md](references/refresh.md) | May | Only when the user explicitly invokes `$toudocu refresh` |
| `$toudocu refresh diff` | [references/refresh.md](references/refresh.md) | May | Only when the user explicitly invokes `$toudocu refresh diff` |
| `$toudocu translate <locale>` | [references/translate.md](references/translate.md) | Yes | Only for an explicit translation request and selected target locale |
| `$toudocu translate diff` | [references/translate.md](references/translate.md) | Yes | Only when explicitly invoked; selects every configured target locale |
| `$toudocu feedback` | [references/feedback.md](references/feedback.md) | May | Explicitly process local Changes feedback; write only evidence-backed code, documentation, and the structured response |
| CLI, portal, task, or ordinary documentation work | [references/workflows.md](references/workflows.md) | Depends on request | Follow the requested mutation; `task verify --run` requires an explicit verification request |

Init, refresh, refresh diff, translate, translate diff, and feedback are agent
workflows. They are not Toudocu Go CLI commands. Never infer initialization
from missing files, first use, or an ordinary documentation request. Feedback
uses the real `toudocu changes feedback` transport but never starts an agent or
LLM itself.

Load these references conditionally:

- [references/writing-quality.md](references/writing-quality.md) before drafting
  or revising reader-facing prose, headings, lists, tables, diagram labels,
  messages, or translations in any language;
- [references/semantic-gate.md](references/semantic-gate.md) before changing
  source documentation;
- [references/document-model.md](references/document-model.md) before creating
  or selecting a typed document, or changing stable IDs and relationships;
- [references/architecture-gate.md](references/architecture-gate.md) only for
  architecture documents;
- [references/screen-model.md](references/screen-model.md) only for `FLOW-*`,
  `SC-*`, `TR-*`, screen states, or hotspots;
- [references/work-item-model.md](references/work-item-model.md) only for
  `TASK-*` or `BUG-*` contracts and task lifecycle work.

## Establish context

1. Read repository instructions, applicable standards, real runbooks, CI,
   documented Toudocu commands, and any explicit project glossary. Preserve
   established product meaning, not accidental awkward wording.
2. Resolve the canonical documentation root, repository root, excludes, stale
   policy, output, strict policy, project locale, and selected document
   language. Use an existing document's established language; use
   `project.locale` for new canonical documents; use the selected target locale
   only during translation.
3. Resolve the CLI as `toudocu` from `PATH`, or `go run ./cmd/toudocu` inside
   the Toudocu source repository. Do not install it without permission.
4. Run the repository's established read-only check before writing. Otherwise
   substitute the resolved paths in:

   ```bash
   toudocu check <docs-root> --repository-root <repository-root> --format json
   ```

Diagnostics prove structural facts, not missing product intent. Never invent
behavior, status, owner, date, relationship, procedure, or terminology to
silence one.

## Write for the reader

Apply the full [reader-first writing gate](references/writing-quality.md). In
particular:

- make the document answer a useful question or support a concrete decision or
  task;
- use one natural target language per paragraph and diagram while preserving
  exact identifiers, commands, paths, fields, protocol names, and product names;
- introduce an uncommon code term through its plain-language meaning, then add
  the exact token in backticks or parentheses only when it improves
  traceability;
- write complete statements that identify the actor or component, its action or
  state, the relevant condition, and the result or consequence;
- distinguish verified current behavior, required behavior, planned behavior,
  and known gaps instead of blending them into one claim;
- treat Mermaid labels, table cells, headings, and error text as reader-facing
  prose, not as a place to dump variable names or event constants.

Do not preserve mixed-language hybrids or literal translations merely because
an earlier draft contains them. Preserve exact technical meaning and rewrite
its explanation idiomatically in the target language.

## Isolate translation context

The canonical documentation root is the only documentation and backlog source
for ordinary work, repository inventory, semantic review, implementation
analysis, and task context. Repository code, tests, contracts, CI, and other
non-translation artifacts remain valid implementation evidence. Exclude every
configured translation root from those activities, including translated work
items. Do not add translation roots to `.gitignore` or global ignore files:
explicit locale workflows must remain able to select them.

Read a configured translation root only for an explicit `$toudocu translate
<locale>`, an explicit `$toudocu translate diff`, or an explicit request to
check, find, build, run, or inspect that specific locale. A whole-root check,
build, run, or inspection may read that selected root. For translation and
parity work, visit one locale and one necessary source/target pair at a time;
compare relative paths, source digests, and structural reports before opening
document contents. For translate diff, visit configured roots in normalized
locale order.

## Preserve documentation invariants

- Every project requires both `index.md` and
  `architecture/overview.md`. The overview declares `Architecture Overview`,
  states the system boundary, and links directly to every other Markdown file
  below `architecture/`.
- Every detailed architecture document answers one explicit architectural
  question. FLOW, CONTRACT, REFERENCE, RUNBOOK, ADR, and MODULE details stay in
  their own sources of truth.
- Use typed documents only for evidence-backed semantics. Unknown top-level
  sections need an `index.md` manifest with `Type: Custom`, owner, description,
  and a useful H1. Create `runbooks/` only for a real operational procedure.
- Replace every template placeholder. Remove unsupported optional sections.
  Mermaid is visualization only; prose owns requirements and acceptance.
- A repository-root `CHANGELOG.md`, when present, is the only special release
  journal. Do not create or duplicate `docs/changelog.md` for the portal.
- Never edit generated `build/`, `dist/`, `project-docs/`, or example portal
  output as source documentation.

## Work items

Create a durable work item only when the user or repository explicitly requires
one, or when substantial work needs durable scope, acceptance, verification, or
handoff. Do not create one for every prompt or small local edit. Start
implementation of an existing Ready+ item with:

```bash
toudocu task context TASK-AREA-001 <docs-root> \
  --repository-root <repository-root> --format json
```

Respect result, scope, exclusions, criteria, dependencies, linked standards,
and runbooks. Review the declared Scope of other standards; do not infer it
from globs. Inspect `task verify --dry-run` first. Run `task verify --run` only
for an explicit verification request in a trusted repository. Archive or
restore only through the corresponding task command.

## Validate and deliver

1. Complete the reader-first writing gate for every changed reader-facing
   source.
2. Complete the semantic gate and any required architecture, screen, or
   work-item gate.
3. Run the ordinary project-wide check:

   ```bash
   toudocu check <docs-root> --repository-root <repository-root>
   ```

4. Run strict validation only when project policy or the user requires it.
5. Build the portal only when requested or needed for verification, and use
   `--clean` only after confirming the resolved output is safe.
6. Report the changed sources, evidence used, writing and semantic review
   results, resolved errors, remaining warnings, validation policy, and any
   verification intentionally not run.
