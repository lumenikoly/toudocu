# CLI and workflow tasks

- Identifier: MOD-CLI
- Status: Completed
- Owner: Docu-docu Team
- Last updated: 2026-08-05

The module provides Docu-docu commands and deterministic workflow from search and
task framework to context and controlled execution of declared checks.

## Purpose

Combine check, build, local view and task workflow operations into
predictable CLI with stable exit codes and JSON output.

## Code location

- public façade and entrypoint: `api.go`, `cmd/docu-docu/main.go`;
- CLI and local HTTP server: `internal/app/cli.go`, `internal/app/server.go`;
- read-only context and readiness: `internal/app/task_context.go`, `internal/app/task_ready.go`;
- search and frameworks: `internal/app/search.go`, `internal/app/scaffold.go`;
- perform verify and manage processes: `internal/app/task_verify.go`, `internal/app/command_process_*.go`.

## Module boundaries

The CLI does not interpret the user request. `task ready` and `task context`
only read data, and `task verify --run` runs commands after local
validation gate. Prompt-workflows `$docu-docu init`, `$docu-docu refresh`
and `$docu-docu refresh diff` are outside the Go CLI boundary.

## Business rules

### BR-CLI-001: Task context does not execute commands

`task context` returns the task, associated entities, documents and diagnostics,
but does not call the system shell.

### BR-CLI-002: Checks are only run explicitly

The `AC-*`, `ALL`, and `DOCS` commands are executed only through `task verify --run`.
The repeating command is executed once and saves all associated targets.

### BR-CLI-003: Timeout terminates process tree

When the timeout is exceeded, not only the shell, but also the child shells it created terminates.
processes; the report receives the status `timed_out`.

### BR-CLI-004: Docu-docu does not interpret user request

Docu-docu creates neutral wireframes and checks the structure. Selecting entities
formulation of requirements, change of status and confirmation of criteria remain
responsibility of the performer.

### BR-CLI-005: Browser and CLI use the same scaffold registry

`task init` and seven variants of `scaffold` preserve public commands, but their
the order, fields, validation, target path and renderer are determined by the same registry,
which `serve` returns editor UI. Creation remains atomic `O_EXCL`.

### BR-CLI-006: A translation root is not a working context

A configured translation root is available to `check`, `build`, read-only
`serve`, `search`, and ordinary changes browsing. `task init`, `task
context`, `task ready`, `task verify`, `task changes`, `task archive`,
`task restore`, `scaffold`, and editor writes are rejected with
`TRANSLATION_ROOT_READ_ONLY`. Translated work items remain a reader-facing
mirror, while agents and CI use only the canonical docs root.

## Invariants

- JSON mode does not mix the report with streaming text output;
- commands are executed consistently even after an error;
- each command is launched from repository root;
- stdout and stderr are limited to the last 1 MiB of each stream;
- assembly requires explicit `docu-docu build`; the path without a command is deviated;
- reserved skill-level names `init` and `refresh` are rejected as
  unknown Go CLI commands;
- task workflow and entity creation never use a configured translation root;
- `serve` listens only to loopback by default; network access is enabled explicitly;
- `--host`, `--port`, `--open` and lack of auto-open are not changed; `--no-open`
  is not added, and `--edit` remains an unknown parameter.

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
- [UC-DOCS-02: Documentation Check](../use-cases/check-documentation.md)
- [UC-DOCS-03: Local Server](../use-cases/serve-portal.md)

## Related processes

- [FLOW-DOCS-CHECK: Documentation contract check](../flows/FLOW-DOCS-CHECK.md)
- [FLOW-DOCS-SERVE: Local portal browsing](../flows/FLOW-DOCS-SERVE.md)
- [FLOW-TASK-WORKFLOW: Working with the task being checked](../flows/FLOW-TASK-WORKFLOW.md)
