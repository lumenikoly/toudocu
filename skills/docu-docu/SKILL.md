---
name: docu-docu
description: Create, update, refresh, validate, and build adaptable project documentation managed by the Docu-docu CLI. Use for explicit Docu-docu documentation work; full-project or HEAD-diff currency reviews; modules, use cases, FLOW-* processes, SC-* screens and TR-* transitions; roadmap, risks, ADRs, contracts, guides, references, or TASK-* work items; integrity diagnostics; task context or verification; and static portals. Initialize project documentation and managed AGENTS.md guidance only when the user explicitly invokes `$docu-docu init`; never initialize implicitly.
---

# Docu-docu

Docu-docu protects explicit relationships and safe paths. Markdown remains the
source of truth; generated portals are output, not documentation sources.

## Route the request

Read the one operation reference selected by this table. Load additional model
or review references only when the request meets their conditions below.

| Operation | Reference | Changes files? | Confirmation / authority |
|---|---|---:|---|
| `$docu-docu init` | [references/init.md](references/init.md) | Yes | Only when the user explicitly invokes `$docu-docu init` |
| `$docu-docu refresh` | [references/refresh.md](references/refresh.md) | May | Only when the user explicitly invokes `$docu-docu refresh` |
| `$docu-docu refresh diff` | [references/refresh.md](references/refresh.md) | May | Only when the user explicitly invokes `$docu-docu refresh diff` |
| `$docu-docu translate <locale>` | [references/translate.md](references/translate.md) | Yes | Only for an explicit translate request and selected target locale |
| `$docu-docu translate diff` | [references/translate.md](references/translate.md) | Yes | Only when explicitly invoked; selects every configured target locale |
| CLI, portal, task, or ordinary documentation work | [references/workflows.md](references/workflows.md) | Depends on request | Follow the user's requested mutation; `task verify --run` needs an explicit verification request |

Init, refresh, refresh diff, translate, and translate diff are agent workflows.
They are not Docu-docu Go CLI commands. Never infer initialization from missing
files, first use, or an ordinary documentation request.
Neither refresh form is a Docu-docu
Go CLI command or an initialization request.

Load these references conditionally:

- [references/semantic-gate.md](references/semantic-gate.md) before changing
  source documentation;
- [references/document-model.md](references/document-model.md) before creating
  or selecting a typed document, or changing stable IDs and relationships;
- [references/architecture-gate.md](references/architecture-gate.md) only for
  architecture documents;
- [references/screen-model.md](references/screen-model.md) only for `FLOW-*`,
  `SC-*`, `TR-*`, or hotspots;
- [references/work-item-model.md](references/work-item-model.md) only for
  `TASK-*` or `BUG-*` contracts and task lifecycle work.

## Establish context

1. Read repository instructions, applicable standards, real runbooks, CI, and
   documented Docu-docu commands. Preserve the project's language and terms.
2. Resolve the CLI as `docu-docu` from `PATH`, or `go run ./cmd/docu-docu` inside
   the Docu-docu source repository. Do not install it without permission.
3. Discover docs root, repository root, excludes, stale policy, output, and
   strict policy from the repository. Use `./docs` and its parent only as a
   fallback.
4. Run the repository's established read-only check before writing. Otherwise
   substitute the resolved paths in:

   ```bash
   docu-docu check <docs-root> --repository-root <repository-root> --format json
   ```

Diagnostics prove structural facts, not missing product intent. Never invent
behavior, status, owner, date, relationship, or procedure to silence one.

## Isolate translation context

The canonical documentation root is the only documentation and backlog source
for ordinary work, repository inventory, semantic review, implementation
analysis, and task context. Repository code, tests, contracts, CI, and other
non-translation artifacts remain valid implementation evidence. Exclude every
configured translation root from those activities, including translated work
items. Do not add translation roots to `.gitignore` or global ignore files:
explicit locale workflows must remain able to select them.

Read a configured translation root only for an explicit `$docu-docu translate
<locale>`, an explicit `$docu-docu translate diff`, or an explicit request to
check, find, build, run, or inspect that specific locale. A whole-root check,
build, run, or inspection may read that selected root. For translation and
parity work, visit one locale and one necessary source/target pair at a time;
compare relative paths, source digests, and structural reports before opening
document contents. For translate diff, visit configured roots in normalized
locale order.

## Documentation invariants

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
one, or when substantial work needs durable scope, acceptance, verification,
or handoff. Do not create one for every prompt or small local edit. Start
implementation of an existing Ready+ item with:

```bash
docu-docu task context TASK-AREA-001 <docs-root> \
  --repository-root <repository-root> --format json
```

Respect result, scope, exclusions, criteria, dependencies, linked standards,
and runbooks. Review the declared Scope of other standards; do not infer it
from globs. Inspect `task verify --dry-run` first. Run `task verify --run` only
for an explicit verification request in a trusted repository. Archive or
restore only through the corresponding task command.

## Validate and deliver

After the semantic gate, run the ordinary project-wide check:

```bash
docu-docu check <docs-root> --repository-root <repository-root>
```

Run strict validation only when project policy or the user requires it. Build
the portal only when requested or needed for verification, and use `--clean`
only after confirming the resolved output is safe. Report semantic review,
changed sources, resolved errors, remaining warnings, validation policy, and
verification intentionally not run.
