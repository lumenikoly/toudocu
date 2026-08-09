# CLI and workflow tasks

- Identifier: MOD-CLI
- Status: Completed
- Owner: Toudocu Team
- Last updated: 2026-08-06

The module provides Toudocu commands and deterministic workflow from search and
task framework to context and controlled execution of declared checks.

## Purpose

Combine check, build, local view and task workflow operations into
predictable CLI with stable exit codes and JSON output.

## Code location

- public façade and entrypoint: `api.go`, `cmd/toudocu/main.go`;
- CLI and local HTTP server: `internal/app/cli.go`, `internal/app/server.go`;
- read-only context and readiness: `internal/app/task_context.go`, `internal/app/task_ready.go`;
- search and frameworks: `internal/app/search.go`, `internal/app/scaffold.go`;
- verification execution and process management: `internal/app/task_verify.go`, `internal/app/command_process_*.go`;
- work-item archiving and restoration: `internal/app/task_archive.go`.
- embedded skill bundle: `skills/bundle.go`;
- registry, planner, manifest, and filesystem lifecycle: `internal/skillinstall/`;
- text CLI and internal TTY context: `internal/app/skill_cli.go`.

## Module boundaries

The CLI does not interpret the user request. `task ready` and `task context`
only read data, and `task verify --run` runs commands after local
validation gate. Prompt-workflows `$toudocu init`, `$toudocu refresh`
and `$toudocu refresh diff` are outside the Go CLI boundary.
The `skill` command manages only files from the embedded package and does not
execute its content; the lifecycle is intentionally absent from the public Go facade.

## Business rules

### BR-CLI-001: Task context does not execute commands

`task context` returns the task, associated entities, documents and diagnostics,
but does not call the system shell.

### BR-CLI-002: Checks are only run explicitly

The `AC-*`, `ALL`, and `DOCS` commands are executed only through `task verify --run`.
The repeating command is executed once and saves all associated targets.

### BR-CLI-003: Timeout terminates process tree

When the timeout is exceeded, both the shell and the child processes it created
are terminated; the report receives the status `timed_out`.

### BR-CLI-004: Toudocu does not interpret user request

Toudocu creates neutral wireframes and checks the structure. Selecting entities
formulation of requirements, change of status and confirmation of criteria remain
responsibility of the performer.

### BR-CLI-005: Browser and CLI use the same scaffold registry

`task init` and seven variants of `scaffold` preserve public commands, but their
the order, fields, validation, target path and renderer are determined by the same registry,
which `serve` returns editor UI. Creation remains atomic `O_EXCL`.

### BR-CLI-006: A translation root is not a work context

A configured translation root is available to `check`, `build`, read-only
`serve`, `search`, and ordinary changes browsing. `task init`, `task
context`, `task ready`, `task verify`, `task changes`, `task archive`,
`task restore`, `scaffold`, and editor writes are rejected with
`TRANSLATION_ROOT_READ_ONLY`. Translated work items remain a reader-facing
mirror, while agents and CI use only the canonical docs root.

### BR-CLI-007: Archiving does not change the task contract

`task archive` and `task restore` move one valid work item without overwriting
and do not change its Markdown or status. The operation is blocked if the move
would break resolution of a direct Markdown link.

### BR-CLI-008: A managed skill does not overwrite user changes

The lifecycle changes only an absent or unchanged managed copy with a valid
manifest. An extra, changed, or deleted bundled file, changed permissions, a
symlink, unmanaged directory, damaged manifest, or newer version blocks the
write; there is no `--force`.

### BR-CLI-009: The skill lifecycle works offline

The only canonical package is embedded in the binary. `skill install`,
`status`, `update`, and `uninstall` do not use the network, a shell, or a
marketplace and do not execute scripts from the bundle.

### BR-CLI-010: Multi-target operations are planned before writing

For `--agent all`, the CLI first resolves and classifies every deduplicated
target. Each target is then processed independently after an error; a conflict
or partial result returns exit code `1`.

## Invariants

- JSON mode does not mix the report with streaming text output;
- commands are executed consistently even after an error;
- each command is launched from repository root;
- stdout and stderr are limited to the last 1 MiB of each stream;
- building requires an explicit `toudocu build`; a path without a command is rejected;
- reserved skill-level names `init` and `refresh` are rejected as
  unknown Go CLI commands;
- task workflow and entity creation never use a configured translation root;
- `serve` listens only to loopback by default; network access is enabled explicitly;
- `--host`, `--port`, `--open` and lack of auto-open are not changed; `--no-open`
  is not added, and `--edit` remains an unknown parameter.
- `skill status` does not write to the filesystem; mutating skill commands
  recheck the snapshot after an atomic backup move and restore the prior copy
  if publication fails.

## Stable interfaces

- commands and parameters from [CLI contract](../contracts/cli.md);
- `ProjectReport` and `TaskContextReport` schema v1;
- `SearchReport`, `TaskInitReport`, `ScaffoldReport`, `TaskReadyReport` and
  `TaskVerifyReport` schema v1;
- exit code `0` only if the operation is successful.

## Related use cases

- [UC-TASK-01: Work Task Context](../use-cases/task-workflow.md)
- [UC-TASK-02: Checking a work task](../use-cases/task-verify.md)
- [UC-TASK-03: Preparing a work task](../use-cases/UC-TASK-03.md)
- [UC-TASK-04: Archiving and restoring a task](../use-cases/UC-TASK-04.md)
- [UC-DOCS-02: Documentation Check](../use-cases/check-documentation.md)
- [UC-DOCS-03: Local Server](../use-cases/serve-portal.md)
- [UC-AGENT-01: Installing the AI skill](../use-cases/UC-AGENT-01.md)

## Related processes

- [FLOW-DOCS-CHECK: Documentation contract check](../flows/FLOW-DOCS-CHECK.md)
- [FLOW-DOCS-SERVE: Local portal browsing](../flows/FLOW-DOCS-SERVE.md)
- [FLOW-TASK-WORKFLOW: Working with the task being checked](../flows/FLOW-TASK-WORKFLOW.md)
