<!-- toudocu
id: BUG-LOGIC-001
status: done
taskType: bug
severity: high
priority: high
reproducibility: always
regression: false
module: MOD-CLI
useCase: UC-TASK-02
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-11
-->

# BUG-LOGIC-001: Align task readiness with the specialized Bug contract


<!-- toudocu:section symptom -->
## Symptom

A correctly documented bug could not pass `task ready` or `task verify`.

<!-- toudocu:section expected-behavior -->
## Expected behavior

A `BUG-*` document accepted by the project model must also pass the task
readiness check. A technical bug may use `Use case: Not applicable` when it
contains the required explanation.

<!-- toudocu:section actual-behavior -->
## Actual behavior

A Ready bug receives `missing-task-result` and `missing-behavior-change`, while
a technical bug additionally receives `missing-task-use-case`.

<!-- toudocu:section steps-to-reproduce -->
## Steps to reproduce

1. Build a model from a complete Ready bug contract without Feature sections.
2. Run `task ready` or `task verify --dry-run` for its ID.
3. Observe the blocking Feature diagnostics.

<!-- toudocu:section evidence -->
## Evidence

The focused Go scenario returned `contract_incomplete` with
`missing-task-result,missing-behavior-change` for a fixture that the main
validator accepts without issues. The repository contains no evidence that
readiness previously worked for this contract, so the defect is not classified
as a regression.

<!-- toudocu:section cause -->
## Cause

`taskReadiness` unconditionally requires `Result` and applies the Feature fields
`BehaviorChange`, `Before`, and `After` to every Bug item without preserving the
main model's allowed use-case exception.

<!-- toudocu:section scope -->
## Scope

- `internal/app/task_ready.go`;
- `internal/app/knowledge.go`;
- `internal/app/types.go`;
- `internal/app/bug_test.go`;
- `docs/work/BUG-LOGIC-001.md`.

<!-- toudocu:section out-of-scope -->
## Out of scope

- changing the specialized Bug contract;
- changing task-workflow statuses or commands;
- fixes for other work-item types.

<!-- toudocu:section plan -->
## Plan

1. Preserve the allowed-missing-use-case flag in `WorkItem`.
2. Separate common, Feature, and Bug readiness requirements.
3. Add regressions for ordinary and technical Ready bugs.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] `AC-01` Regression tests confirm that valid ordinary and technical Ready
  bugs pass `task ready`.
- [x] `AC-02` `task verify --dry-run` builds a plan for a valid Bug without
  Feature diagnostics and does not execute commands.

<!-- toudocu:section verification -->
## Verification

- `AC-01` → `go test ./internal/app -run 'TestBugWorkItemValidationAndPortalFilters|TestTechnicalBugMayExplainMissingUseCase'`
- `AC-02` → `go test ./internal/app -run 'TestBugWorkItemValidationAndPortalFilters'`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

<!-- toudocu:section regression-test -->
## Regression test

Ordinary and technical Ready bugs are checked through the public readiness and
dry-run reports, not only through the internal parser.

<!-- toudocu:section documentation-impact -->
## Documentation impact

Only this historical record changed. The fix restored the documented Bug
contract.
