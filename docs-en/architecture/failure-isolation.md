# Isolation of documentation and check errors

- Document type: Architecture
- Architecture question: How are errors in documentation and running checks isolated?

Reading and structure errors turn into document-linked diagnostics
and do not open the way to fulfillment. Explicitly triggered task checks are executed
sequentially in a separate process boundary, and their failures are timeout and limited
the conclusion is recorded in the report. Only the editor API of `serve` mode changes the selected
workspace file according to CAS; allowed shell commands have the rights of the current
user and can change the entire repository.

## Area

The answer describes the isolation of two classes of failures: unreliable documentation and
commands allowed through task workflow. User scripts remain in
[FLOW-DOCS-CHECK](../flows/FLOW-DOCS-CHECK.md) and
[FLOW-TASK-WORKFLOW](../flows/FLOW-TASK-WORKFLOW.md).

## Documentation errors

Scanning continues to collect available documents, and validation adds
stable issues for the general model and specific files. The presence of error makes
the operation was unsuccessful; warning changes exit code only in strict mode. None
diagnostic path does not run work item commands.

## Errors when running checks

`task verify --run` first requires a valid task-local contract. After admission
each unique command is executed from repository root, and one command fails
does not hide the results of others. Timeout terminates the process tree, stdout and
stderr are stored in a limited tail, and the final report is separated from the original
documentation. The safety of the side effects of the commands themselves ensures trust
to the repository and the initiator's explicit decision to launch.

## Editor workspace errors

Diagnostics preview and validation do not block save. Malformed request, unsafe
path, oversized content and stale digest are completed before the source is replaced. Temp
is written in the same directory, synchronized and atomically replaces the file only after
repeat CAS check. A rebuild error is returned to the current request or to
server log watcher and does not turn into running a command.