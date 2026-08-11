# Isolating documentation and verification failures

- Document type: Architecture
- Architectural question: How are documentation errors and failed verification commands isolated?

Read and structure problems become diagnostics attached to files; they never
cause code to run. Work-item commands run only after explicit authorization,
each in a separate process. The `serve` editor can replace only the selected
allowed file, while an authorized verification command runs with the current
user's permissions and may therefore change the whole repository.

## Scope

This document separates failures in documentation, executed commands, and the
editor. The user-facing sequences are in
[FLOW-DOCS-CHECK](../flows/FLOW-DOCS-CHECK.md) and
[FLOW-TASK-WORKFLOW](../flows/FLOW-TASK-WORKFLOW.md).

## Documentation errors

Scanning continues through documents that can still be read. Validation adds
problems to the project model and to the affected files. An error makes the
operation fail; a warning changes the exit code only with `--strict`. No
diagnostic path executes commands from a work item.

## Verification command failures

`task verify --run` first requires a complete and valid task-local contract.
It then starts each unique command from the repository root. One failed command
does not hide the results of the others. A timeout stops the command's entire
process tree, and only bounded tails of stdout and stderr are retained. The
execution report is not written back into the source Markdown.

Toudocu cannot guarantee that an allowed command has safe side effects. The
user accepts that responsibility by explicitly authorizing execution in a
trusted repository.

## Editor failures

Preview diagnostics do not prevent saving. A malformed request, unsafe path,
oversized body, or stale content hash is rejected before the source is
replaced. A temporary file is created in the same directory, synchronized, and
atomically replaces the source only after the hash is checked again. A later
rebuild failure is returned to the current request or written to the watcher's
log; it neither starts a project command nor stops the running server.
