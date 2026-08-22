<!-- toudocu
version: 1
id: UC-TASK-02
status: done
priority: high
module: MOD-CLI
updated: 2026-08-12
-->

# UC-TASK-02: Verify a work item


The assignee first reads the exact command plan without execution, then uses a
separate explicit action to run every command or one selected target.

## Inputs

- stable `TASK-*` identifier;
- documentation and repository roots;
- per-command timeout;
- `--dry-run` or `--run`;
- optional `AC-*`, `ALL`, `DOCS`, or `QUALITY` target;
- optional JSON report path.

<!-- toudocu:section prerequisites -->
## Preconditions

- `--run` requires at least Ready status;
- a complete Draft may use `--dry-run`, which executes nothing;
- the repository owner has read and trusts the commands in Verification;
- the assignee understands that commands run with their permissions and may
  change the repository.

<!-- toudocu:section main-scenario -->
## Main flow

1. The assignee runs:

   ```bash
   toudocu task verify TASK-ID ./docs --dry-run --format json
   ```

2. Toudocu finds the work item and validates only its contract and direct
   relationships.
3. It collects unique `AC-*`, `ALL`, `DOCS`, and, when required, `QUALITY`
   commands from explicitly related standards.
4. The report lists commands as `planned`; nothing runs.
5. After reading the plan and receiving separate authorization, the assignee
   repeats the command with `--run`.
6. Commands run sequentially from the repository root, and
   `TaskVerifyReport` maps their results back to acceptance criteria.
7. The assignee evaluates the status, exit code, and actual command output.

## Error flows

- A missing or duplicate identifier returns code `1`.
- Draft and Cancelled block `--run` before any command starts.
- A task-contract error returns `blocked` and starts nothing.
- A command that cannot start receives `start_error`; non-zero exit becomes
  `failed`; timeout becomes `timed_out` and stops the process tree.
- One failed command does not cancel the others.
- Failure to write `--report` returns a non-zero code even when commands pass.

<!-- toudocu:section postconditions -->
## Postconditions

`--dry-run` without `--report` changes nothing; with `--report`, it atomically
writes only the selected JSON file outside documentation. In `--run`, every
admitted command receives a result. Final status is `planned`, `passed`,
`failed`, or `blocked`; only `planned` and `passed` return code `0`.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] `--dry-run` without `--report` changes nothing; with `--report`, it
  atomically writes only the selected JSON file outside documentation.
- [x] In `--run`, every admitted command receives a result.
- [x] Final status is `planned`, `passed`, `failed`, or `blocked`; only
  `planned` and `passed` return code `0`.

<!-- toudocu:section business-rules -->
## Business rules

- [BR-CLI-002](../modules/cli.md#br-cli-002-checks-are-only-run-explicitly)
- [BR-CLI-003](../modules/cli.md#br-cli-003-timeout-terminates-process-tree)
- [BR-MODEL-003](../modules/model.md#br-model-003-a-ready-to-run-task-has-a-full-verifiable-contract)

<!-- toudocu:section implementation -->
## Implementation

- [FLOW-TASK-WORKFLOW](../flows/FLOW-TASK-WORKFLOW.md)
- [CLI and work-item operations](../modules/cli.md)
- [Project model](../modules/model.md)
- [CLI contract](../contracts/cli.md)
- [Work-item guide](../guides/work-items.md)

## Scenario verification

Coverage includes a no-execution plan, command deduplication, startup failure,
continuation after failure, timeout process-tree termination, criterion mapping,
and a Windows amd64 cross-build.
