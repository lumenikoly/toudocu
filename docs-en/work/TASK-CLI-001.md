<!-- toudocu
id: TASK-CLI-001
status: done
taskType: feature
priority: high
module: MOD-CLI
useCase: UC-TASK-03
flow: FLOW-TASK-WORKFLOW
updated: 2026-08-10
-->

# TASK-CLI-001: Implement the complete work-item workflow


<!-- toudocu:section result -->
## Result

The CLI takes a user from finding relevant documentation and creating a
scaffold to checking readiness, collecting context, and explicitly running the
selected work item's commands.

<!-- toudocu:section behavior-change -->
## Behavior change

<!-- toudocu:section before -->
### Before

The CLI provided only `task context` and the command-running `task check`.
Scaffolding, readiness checks, and source search were missing.

<!-- toudocu:section after -->
### After

The CLI provides `search`, `task init`, `scaffold`, `task ready`, extended
`task context`, and `task verify`. The old `task check` command is rejected.

<!-- toudocu:section scope -->
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

<!-- toudocu:section out-of-scope -->
## Out of scope

- interpretation of natural-language request inside Toudocu;
- automatic selection or filling of entities;
- automatic change of statuses and acceptance checkboxes;
- new external dependencies.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] `AC-01` New CLI forms are parsed deterministically, and `task check` is rejected.
- [x] `AC-02` Search, init and scaffold respect ranking, ID-based paths and atomic create.
- [x] `AC-03` Ready and context return the full local contract without modifying files or executing commands.
- [x] `AC-04` Verify supports dry-run, targeted and full run with secure reporting and limited output.
- [x] `AC-05` All public JSON reports use a single schema v1.

<!-- toudocu:section plan -->
## Plan

- [x] Expand parser, report types and task contract.
- [x] Implement search, wireframes and readiness.
- [x] Expand context and replace check with verify.
- [x] Synchronize documentation, skills and tests.
- [x] Run a full verification cycle.

<!-- toudocu:section verification -->
## Verification

- `AC-01` → `go test ./... -run 'TestCLI|TestTask'`
- `AC-02` → `go test ./... -run 'TestSearch|TestInit|TestScaffold'`
- `AC-03` → `go test ./... -run 'TestTaskReady|TestTaskContext'`
- `AC-04` → `go test ./... -run 'TestTaskVerify|TestCommandProcess'`
- `AC-05` → `go test ./... -run 'TestGenerateSite|TestProjectReport'`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict`

<!-- toudocu:section documentation-impact -->
## Documentation impact

`README.md`, `CHANGELOG.md`, `docs/contracts/cli.md`,
`docs/roadmap.md`, `docs/use-cases/`, `docs/flows/FLOW-TASK-WORKFLOW.md`,
`docs/decisions/ADR-002.md`, and `skills/toudocu/`.
