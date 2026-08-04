# Docgent workflows

Use this reference when invoking the CLI, interpreting diagnostics, building a
portal, or working with `TASK-*`.

## Discover conventions

Before choosing flags:

1. search repository instructions, CI, scripts, and documentation for existing
   Docgent commands;
2. reuse the existing documentation directory, repository root, excludes,
   stale policy, output directory, and strict policy;
3. in a monorepo, choose the narrowest repository root that contains both the
   documentation and every referenced code or task-scope path;
4. fall back to `./docs` and its parent only when no convention exists.

Use `docgent` from `PATH`. In the Docgent source repository, substitute
`go run ./cmd/docgent`. Docgent has no `init` command; create Markdown from the
bundled templates.

## Command matrix

| Command | Mutates or executes | Use |
|---|---|---|
| `check` | No | Validate safety, links, IDs, and explicit relationships |
| `build` | Writes output; `--clean` removes safe output | Generate the static portal and report |
| `serve` | Builds output and starts local HTTP | Preview with rebuilds |
| `task context` | No | Read a compact task-local model |
| `task check` | Executes trusted repository commands | Verify an explicitly requested task |

Prefer JSON for agent diagnosis and text for human confirmation:

```bash
docgent check ./docs --repository-root . --format json
docgent check ./docs --repository-root .
```

The ordinary check fails on errors and reports warnings. `--strict` additionally
turns warnings into a failing exit code. Use strict only when repository policy,
CI, or the user requires it.

## Diagnostic loop

1. Run `check --format json`.
2. Group issues by document and stable code.
3. Fix every error at its source.
4. Evaluate warnings as editorial guidance; fix only those supported by project
   evidence.
5. Re-run an ordinary project-wide check.
6. If strict validation is project policy, run it as an additional final gate.

Do not suppress an integrity error by removing a meaningful relationship. Do
not suppress a warning by inventing status, dates, owners, sections, or
behavior. Report warnings intentionally left unresolved.

## New documentation

Create a neutral `index.md` first. Add free-form documents as needed. Opt into
typed documents only for semantics the project will use:

- add a module when stable ownership, boundaries, or business rules matter;
- add a use case when observable behavior should link to a module;
- add a flow when a reusable Mermaid visualization should link to a use case or
  architecture document;
- add a roadmap when the project wants global progress aggregation;
- add a work item when an agent or CI needs a checkable task contract.

When adding related types, create targets before references: module and rules,
then use case, then optional flow, then roadmap or work item. Replace every
template placeholder before validation. A flow never replaces prose
requirements or acceptance criteria.

## Task workflow

Start with:

```bash
docgent task context TASK-AREA-001 ./docs \
  --repository-root . \
  --format json
```

Use the task, related entities, dependencies, documents, and issues from the
report. Inspect source artifacts when the compact context is insufficient.
`task context` never executes checks.

Run:

```bash
docgent task check TASK-AREA-001 ./docs \
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

Use `serve` on `127.0.0.1` by default. It has no TLS or authentication. Use
`--host 0.0.0.0` only for an explicitly requested trusted local-network
preview.
