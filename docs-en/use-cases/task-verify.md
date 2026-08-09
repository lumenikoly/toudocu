# UC-TASK-02: Check work task

- Identifier: UC-TASK-02
- Status: Completed
- Actor: Performer - developer or software agent
- Module: MOD-CLI
- Priority: High
- Last updated: 2026-07-28

The executor first receives a check plan without execution, and then with an explicit
choosing, launches all or one target and receives a full report.

## Inputs

- stable `TASK-*` ID;
- documentation directory and repository root;
- timeout of each command;
- `--dry-run` or `--run` mode;
- optional target `AC-*`, `ALL` or `DOCS`;
- optional JSON report path.

## Preconditions

- for `--run` the task is prepared at least to the `Готово к работе` status;
- `--dry-run` is allowed for full Draft and does not execute commands;
- the repository owner trusts the commands from the `Проверка` section;
- the performer realizes that the commands are launched with his rights.

## Main scenario

1. The performer calls
   `toudocu task verify TASK-ID ./docs --dry-run --format json`.
2. Toudocu finds the task and applies the task-local validation gate to it.
3. Toudocu lists the unique `AC-*`, `ALL`, and `DOCS` commands.
4. Dry-run returns commands with status `planned` without executing anything.
5. After checking the plan, the executor explicitly calls `task verify --run`.
6. Toudocu sequentially runs the selected commands from the repository root.
7. Toudocu connects command results with criteria and generates
   `TaskVerifyReport`.
8. The executor uses the final status, exit code and command output to
   accepting the result.

## Error scenarios

- a missing or ambiguous ID terminates the command with code `1`;
- Draft and Canceled block `--run` without executing commands;
- contract error of the selected task blocks the launch of all commands and gives status
  `blocked`;
- a command that cannot be run receives status `start_error`;
- a non-zero exit code of the command gives it status `failed`;
- exceeding timeout terminates the process tree and gives status `timed_out`;
- an error in one command does not stop other checks;
- error writing `--report` gives a non-zero exit code, even if the checks have passed.

## Postconditions

Dry-run has no external effects. In run mode, all selected commands received
the result if the validation gate did not block the launch. The final status is
`planned`, `passed`, `failed` or `blocked`; exit code `0` is returned for
`planned` and `passed`. Commands in run mode can change
repository because they are executed as normal trusted code.

## Business rules

The rules are defined in the documents of the corresponding modules:

- [BR-CLI-002](../modules/cli.md#br-cli-002-checks-are-only-run-explicitly) - checks are launched only explicitly.
- [BR-CLI-003](../modules/cli.md#br-cli-003-timeout-terminates-process-tree) - timeout terminates the process tree.
- [BR-MODEL-003](../modules/model.md#br-model-003-a-ready-to-run-task-has-a-full-verifiable-contract) - a task ready for work has a full verifiable contract.

## Implementation

- [FLOW-TASK-WORKFLOW: Working with the task being checked](../flows/FLOW-TASK-WORKFLOW.md)
- [CLI and workflow tasks](../modules/cli.md)
- [Design Model and Validation](../modules/model.md)
- [CLI contract](../contracts/cli.md)
- [Work Task Guide](../guides/work-items.md)

## Examination

- fake runner for deduplication, startup errors and continuation after an error;
- real Unix process group completion test;
- JSON test of the matrix of criteria and command results;
- task-local validation gate;
- Windows amd64 cross-build.
