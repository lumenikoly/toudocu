# BUG-CHANGES-003: Select task changes by exact ID

- Type: Bug
- Status: Completed
- Severity: Medium
- Priority: High
- Reproducibility: Always
- Regression: No
- Module: MOD-CHANGES
- Use case: UC-DOCS-05
- Owner: Toudocu Team
- Standards: STD-GO-001, STD-DOCS-001
- Last updated: 2026-08-09

## Symptom

`task changes` depends on the task filename and conflates IDs that share a
prefix.

## Expected behavior

The task contract is selected by the exact stable ID in the H1 of the selected
Git snapshot; the filename does not participate in identity.

## Actual behavior

A file without an ID in its name is not found, while a change to `TASK-X-0010`
is treated as a task file for `TASK-X-001`.

## Steps to reproduce

1. Create a valid work item in `custom-name.md`.
2. Add another work item whose ID shares the same prefix.
3. Run `task changes` for the first ID and inspect the selected contract and
   changes.

## Evidence

`taskDocumentContent`, `buildTaskImpact`, and `changeRelatedToTask` use
`strings.Contains` on the basename instead of a parsed ID. Correct prior
behavior for an arbitrary filename is not supported, so the regression value
is No.

## Cause

Changes re-derives work-item identity from the filename instead of using the
exact H1 ID from the snapshot document.

## Scope

- `internal/app/changes_git.go`;
- `internal/app/changes_build.go`;
- `internal/app/changes_report.go`;
- `internal/app/changes_types.go`;
- `internal/app/changes_test.go`;
- `docs/work/BUG-CHANGES-003.md`.

## Out of scope

- renaming existing work items;
- changing stable task IDs;
- building a full ProjectModel for each Git side.

## Plan

1. Find the exact ID from the parsed H1 of every snapshot task document.
2. Preserve the selected task path in private change context.
3. Use the exact path in impact analysis and the task filter.

## Acceptance criteria

- [x] `AC-01` The regression test selects a task by exact ID with an arbitrary
  filename.
- [x] `AC-02` A work item whose ID extends the selected ID is excluded from the
  selected task's `TaskChanges`.

## Verification

- `AC-01` → `go test ./internal/app -run TestTaskChangesSelectsExactTaskIDFromHeading`
- `AC-02` → `go test ./internal/app -run TestTaskChangesSelectsExactTaskIDFromHeading`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

## Regression test

The Git fixture uses a filename without a task ID and a neighboring ID with a
shared prefix.

## Documentation impact

Only `docs/work/BUG-CHANGES-003.md` changes; the stable-ID rule is already
documented.
