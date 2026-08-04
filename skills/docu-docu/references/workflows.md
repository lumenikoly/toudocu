# Docu-docu workflows

Use this reference when invoking the CLI, interpreting diagnostics, building a
portal, or working with `TASK-*`.

## Discover conventions

Before choosing flags:

1. search repository instructions, CI, scripts, and documentation for existing
   Docu-docu commands;
2. reuse the existing documentation directory, repository root, excludes,
   stale policy, output directory, and strict policy;
3. in a monorepo, choose the narrowest repository root that contains both the
   documentation and every referenced code or task-scope path;
4. fall back to `./docs` and its parent only when no convention exists.

Use `docu-docu` from `PATH`. In the Docu-docu source repository, substitute
`go run ./cmd/docu-docu`. The Go CLI has no `init` command. The explicit
`$docu-docu init` prompt follows [init.md](init.md); other document creation
uses the bundled templates.

The Go CLI also has no `refresh` command. Explicit `$docu-docu refresh` and
`$docu-docu refresh diff` prompts follow [refresh.md](refresh.md). The first
reviews all source documentation; the second scopes evidence from the current
worktree relative to `HEAD` and includes affected documentation.

## Documentation gate

For every documentation change, use this sequence:

1. define the audience, purpose, and useful question;
2. identify the source of truth and decide whether to update an existing file;
3. draft only evidence-backed content;
4. complete the author review from [semantic-gate.md](semantic-gate.md);
5. obtain independent semantic review when the change is risk-bearing;
6. run Docu-docu as the structural gate.

An initial read-only `check` may be used during discovery. Its diagnostics are
evidence about the declared structure, not instructions to invent content.
Do not call a document complete until the required semantic gate and the final
structural check both pass.

## Command matrix

| Command | Mutates or executes | Use |
|---|---|---|
| `check` | No | Validate safety, links, IDs, and explicit relationships |
| `build` | Writes output; `--clean` removes safe output | Generate the static portal and report |
| `serve` | Builds output and starts local HTTP | Preview with rebuilds |
| `search` | No | Find source documents |
| `task init` / `scaffold` | Creates one file | Create a neutral ID-based scaffold |
| `task ready` | No | Validate a full Draft or Ready contract |
| `task context` | No | Read full Ready+ task-local context |
| `task verify --dry-run` | No | Inspect the verification plan |
| `task verify --run` | Executes trusted repository commands | Verify an explicitly requested task |
| `task archive` | Moves one file | Archive one valid Done or Cancelled task |
| `task restore` | Moves one file | Restore one task from the yearly archive |

Prefer JSON for agent diagnosis and text for human confirmation:

```bash
docu-docu check ./docs --repository-root . --format json
docu-docu check ./docs --repository-root .
```

The ordinary check fails on errors and reports warnings. `--strict` additionally
turns warnings into a failing exit code. Use strict only when repository policy,
CI, or the user requires it.

## Diagnostic loop

1. Confirm that the semantic gate for the draft has passed.
2. Run `check --format json`.
3. Group issues by document and stable code.
4. Fix every error at its source without adding unsupported semantics.
5. Evaluate warnings as editorial guidance; fix only those supported by project
   evidence.
6. Re-run an ordinary project-wide check.
7. If strict validation is project policy, run it as an additional final gate.

Do not suppress an integrity error by removing a meaningful relationship. Do
not suppress a warning by inventing status, dates, owners, sections, or
behavior. Report warnings intentionally left unresolved.

## New documentation

Create a neutral `index.md` and required `architecture/overview.md` first. Keep
its question map empty until evidence supports a distinct detailed answer. Add
free-form documents as needed. Opt into typed documents only for semantics the
project will use:

- add a module when stable ownership, boundaries, or business rules matter;
- add a use case when observable behavior should link to a module;
- add a flow when a reusable Mermaid visualization should link through
  `Scenario` to one or more use cases, or directly to an architecture document;
- add `screens/SC-*.md` when product navigation needs stable `SC-*`, a
  searchable catalog, graph validation, actions, states or acceptance context;
- add a roadmap when the project wants global progress aggregation;
- add a work item when an agent or CI needs a checkable task contract.

When adding related types, create targets before references: module and rules,
then use case, then screen documents or flow, then roadmap or work item.
Replace every template placeholder before validation. A map or flow never
replaces prose requirements or acceptance criteria.

Do not let the template select the entities or topology. In a flow template,
replace `OPTIONAL_USE_CASES_METADATA` with the complete `Scenario` metadata line
containing one or more `UC-*`, or with an empty value for an architectural
flow. Replace `RELATED_DOCUMENT_LINKS` with one or more links to those use cases
or to the relevant architecture document. Docu-docu derives reverse `UC ↔ FLOW`
relationships from the `Scenario` list. Whole-section placeholders such as
`FLOW_DIAGRAM` and `TRANSITION_ROWS` must be replaced with content derived from
product or repository evidence.

## Task workflow

Create a work item only when the user or repository policy explicitly requires
one, or when substantial work needs durable scope, acceptance criteria,
verification, or handoff. Do not create one for every prompt, ordinary
question, small local edit, or behavior-preserving refactor.

For qualifying new work, start with `search`, `task init`, semantic filling and
read-only `task ready`. For implementation of an existing Ready+ task, start
with:

```bash
docu-docu task context TASK-AREA-001 ./docs \
  --repository-root . \
  --format json
```

Use the task, related entities, dependencies, documents, and issues from the
report. Inspect source artifacts when the compact context is insufficient.
`task context` never executes checks.

A task with `Flow` includes its `FLOW-*` document. A task with `Screens`
includes selected screen records, incident transitions, and matching `SC-*`
documents.

Task lists are allowed in both `Acceptance criteria` and `Plan`. Acceptance
criteria retain unique `AC-*` identifiers and verification mappings; plan
checkboxes track implementation steps and need neither.

Keep active task files in `work/`. Archive a terminal task only through:

```bash
docu-docu task archive TASK-AREA-001 ./docs --format json
docu-docu task restore TASK-AREA-001 ./docs --format json
```

The archive path is `work/archive/YYYY/`. Archive and restore preserve Markdown
and status, and block when a direct Markdown link would change resolution.
Relationships by `TASK-*` or `BUG-*` ID remain valid. Do not delete archived
work items that still participate in dependencies or traceability.

Run:

```bash
docu-docu task verify TASK-AREA-001 ./docs --dry-run \
  --repository-root . \
  --format json

docu-docu task verify TASK-AREA-001 ./docs --run \
  --repository-root . \
  --format json \
  --report ./build/task-report.json \
  --timeout 10m
```

only when all of these are true:

- the user explicitly asked to execute or verify the task;
- the repository and commands are trusted;
- the task-local validation gate passes;
- the report path is outside source documentation.

The command executes each unique shell command from `AC-*`, `ALL`, and `DOCS`
once from repository root. A failure does not stop remaining commands.

## Build and serve

Build only when requested or required for verification. Reuse the project's
generated-output convention; otherwise select a dedicated disposable
directory. Add `--clean` only after verifying the resolved output is neither
input, its ancestor, a system root, nor an unsafe symlink target.

When `screens/SC-*.md` exists, the build includes a catalog, Screen Map,
playable flows and traceability by default. Use `--no-screen-map` only to omit
the interactive map page; it does not remove screen documents, flows or JSON
collections.

Use `serve` on `127.0.0.1` by default. It has no TLS or authentication. Use
`--host 0.0.0.0` only for an explicitly requested trusted local-network
preview.
