# Docu-docu CLI v1

- Identifier: CON-CLI-V1
- Status: Completed
- Owner: Docu-docu Team
- Last updated: 2026-08-05

This document defines CLI commands, side effects, exit codes, and versioned JSON
results. `docu-docu COMMAND --help` shows the exact flag syntax.

## Commands

| Command | What it does | Changes data |
|---|---|---|
| `check` | Validates documents, relationships, and OpenAPI | No |
| `build` | Builds a backend-independent static HTTP portal and `report.json` | Writes only to output; `--clean` clears validated output |
| `serve` | Starts the local portal, watcher, Editor API, and Changes API | Changes canonical docs only after an explicit editor save |
| `search` | Searches the current model | No |
| `changes`, `changes file` | Compares Git revisions, index, and working tree | No |
| `task changes` | Shows changes and impact for the selected task | No |
| `task init` | Creates a draft `TASK-*` or `BUG-*` | Creates one new file without overwriting |
| `scaffold` | Creates a typed document | Creates one new file without overwriting |
| `task ready`, `task context` | Checks readiness or returns task context | No |
| `task verify --dry-run` | Shows the task verification plan | No |
| `task verify --run` | Runs commands explicitly recorded in the task | Yes, within the effects of the repository commands themselves |
| `task archive`, `task restore` | Moves a completed task to the archive or back | Moves one file without overwriting |
| `version` | Prints the version | No |

A path without a command name does not start an implicit build. There are no
top-level `init` and `refresh` commands: the similarly named `$docu-docu`
workflows belong to the AI skill, not the Go CLI.

## General rules

- The input directory is specified explicitly; by default, the server listens
  on `127.0.0.1:8080` without TLS or authentication.
- `--host 0.0.0.0` exposes `serve` to a trusted local network.
- `build` remains static and read-only. Editor, Swagger UI, and server-only
  scripts are not included in the result; the OpenAPI files themselves are
  copied. The existing `serve` provides a local browser runtime; there is no
  `preview` command.
- A configured translation root may be checked, built, searched, compared, and
  served read-only. Task workflows, scaffold, and Editor return
  `TRANSLATION_ROOT_READ_ONLY` before changing files or running checks.
- `task verify --run` is allowed only for Ready, In Progress, Blocked, and Done;
  `--dry-run` may also be used for a complete Draft.
- `changes` reads Git directly without a shell, fetch, checkout, or index write.

## JSON results

Every public report uses `schemaVersion: 1`.

- `ProjectReport` describes the project, documents, relationships, roadmap,
  risks, knowledge, screens, flows, and diagnostics.
- `SearchReport`, `TaskInitReport`, `ScaffoldReport`, `TaskReadyReport`,
  `TaskContextReport`, `TaskMoveReport`, and `TaskVerifyReport` belong to their
  corresponding workflows.
- `ChangeSetReport` is a separate change-report schema and is not part of
  `ProjectReport`.

Empty collections serialize as `[]`; line numbers start at one. New optional
fields may be added without changing the schema version.

For every command, `task verify` records the exit code, time, duration, bounded
stdout/stderr, and associated targets. The final status is `passed`, `failed`,
or `blocked`.

## Exit codes

- `0` — the operation completed successfully.
- `1` — an argument, I/O, model, generation, or verification error.
- `1` with `--strict` — at least one warning was found.
- `changes`: `2` for an argument or revision error, `3` when Git is unavailable,
  and `4` for an internal error.
- `serve`: an initial build or listener error ends the command with `1`; a later
  rebuild error does not stop the server.

## Detailed rules

- [Work items](../guides/work-items.md)
- [Viewing changes](../guides/documentation-changes.md)
- [Document types](../reference/document-types.md)
- [Configuration](../reference/configuration.md)
