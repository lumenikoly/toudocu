# TASK-CLI-001: Implement the complete workflow of a work task

- Status: Completed
- Type: Feature
- Priority: High
- Module: MOD-CLI
- Use case: UC-TASK-03
- Flow: FLOW-TASK-WORKFLOW
- Owner: Toudocu Team
- Last updated: 2026-07-29

## Result

The CLI provides a deterministic path from searching documentation and creating
framework to readiness, context and explicit verification of the selected task.

## Behavior change

### Before

The CLI provided only `task context` and the `task check` execution command;
frameworks, readiness and source-level search were missing.

### After

The CLI provides `search`, `task init`, `scaffold`, `task ready`, extended
`task context` and `task verify`; The old `task check` command is missing.

## Scope

- `internal/app/cli.go`
- `internal/app/types.go`
- `report_types.go`
- `internal/app/knowledge.go`
- `internal/app/task_verify.go`
- `internal/app/task_context.go`
- `search.go`
- `internal/app/scaffold.go`
- `internal/app/task_ready.go`
- `docs/`
- `skills/toudocu/`

## Out of scope

- interpretation of natural-language request inside Toudocu;
- automatic selection or filling of entities;
- automatic change of statuses and acceptance checkboxes;
- new external dependencies.

## Acceptance criteria

- [x] `AC-01` New CLI forms are parsed deterministically, and `task check` is rejected.
- [x] `AC-02` Search, init and scaffold respect ranking, ID-based paths and atomic create.
- [x] `AC-03` Ready and context return the full local contract without modifying files or executing commands.
- [x] `AC-04` Verify supports dry-run, targeted and full run with secure reporting and limited output.
- [x] `AC-05` All public JSON reports use a single schema v1.

## Plan

- [x] Expand parser, report types and task contract.
- [x] Implement search, wireframes and readiness.
- [x] Expand context and replace check with verify.
- [x] Synchronize documentation, skills and tests.
- [x] Run a full verification cycle.

## Verification

- `AC-01` → `go test ./... -run 'TestCLI|TestTask'`
- `AC-02` → `go test ./... -run 'TestSearch|TestInit|TestScaffold'`
- `AC-03` → `go test ./... -run 'TestTaskReady|TestTaskContext'`
- `AC-04` → `go test ./... -run 'TestTaskVerify|TestCommandProcess'`
- `AC-05` → `go test ./... -run 'TestGenerateSite|TestProjectReport'`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict`

## Documentation impact

`README.md`, `CHANGELOG.md`, `docs/contracts/cli.md`,
`docs/roadmap.md`, `docs/use-cases/`, `docs/flows/FLOW-TASK-WORKFLOW.md`,
`docs/decisions/ADR-002.md` and `skills/toudocu/`.