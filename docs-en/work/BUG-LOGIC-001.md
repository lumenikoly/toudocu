# BUG-LOGIC-001: Align task readiness with the specialized Bug contract

- Type: Bug
- Status: Completed
- Severity: High
- Priority: High
- Reproducibility: Always
- Regression: No
- Module: MOD-CLI
- Use case: UC-TASK-02
- Owner: Docu-docu Team
- Standards: STD-GO-001, STD-DOCS-001
- Last updated: 2026-08-09

## Symptom

A valid Ready bug cannot pass through `task ready` or `task verify`.

## Expected behavior

The specialized `BUG-*` contract accepted by the project model passes the
task-local readiness gate. A technical bug with `Use case: Not applicable`
retains the documented exception.

## Actual behavior

A Ready bug receives `missing-task-result` and `missing-behavior-change`, while
a technical bug additionally receives `missing-task-use-case`.

## Steps to reproduce

1. Build a model from a complete Ready bug contract without Feature sections.
2. Run `task ready` or `task verify --dry-run` for its ID.
3. Observe the blocking Feature diagnostics.

## Evidence

The focused Go scenario returned `contract_incomplete` with
`missing-task-result,missing-behavior-change` for a fixture that the main
validator accepts without issues. The repository contains no evidence that
readiness previously worked for this contract, so the defect is not classified
as a regression.

## Cause

`taskReadiness` unconditionally requires `Result` and applies the Feature fields
`BehaviorChange`, `Before`, and `After` to every Bug item without preserving the
main model's allowed use-case exception.

## Scope

- `internal/app/task_ready.go`;
- `internal/app/knowledge.go`;
- `internal/app/types.go`;
- `internal/app/bug_test.go`;
- `docs/work/BUG-LOGIC-001.md`.

## Out of scope

- changing the specialized Bug contract;
- changing task-workflow statuses or commands;
- fixes for other work-item types.

## Plan

1. Preserve the allowed-missing-use-case flag in `WorkItem`.
2. Separate common, Feature, and Bug readiness requirements.
3. Add regressions for ordinary and technical Ready bugs.

## Acceptance criteria

- [x] `AC-01` Regression tests confirm that valid ordinary and technical Ready
  bugs pass `task ready`.
- [x] `AC-02` `task verify --dry-run` builds a plan for a valid Bug without
  Feature diagnostics and does not execute commands.

## Verification

- `AC-01` → `go test ./internal/app -run 'TestBugWorkItemValidationAndPortalFilters|TestTechnicalBugMayExplainMissingUseCase'`
- `AC-02` → `go test ./internal/app -run 'TestBugWorkItemValidationAndPortalFilters'`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/docu-docu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/docu-docu || exit 1; done`

## Regression test

Ordinary and technical Ready bugs are checked through the public readiness and
dry-run reports, not only through the internal parser.

## Documentation impact

Only `docs/work/BUG-LOGIC-001.md` changes; the fix restores the already
documented specialized Bug contract.
