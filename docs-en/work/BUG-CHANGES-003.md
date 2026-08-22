<!-- toudocu
version: 1
id: BUG-CHANGES-003
status: done
taskType: bug
severity: medium
priority: high
reproducibility: always
regression: false
module: MOD-CHANGES
useCase: UC-DOCS-05
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-11
-->

# BUG-CHANGES-003: Select task changes by exact ID


<!-- toudocu:section symptom -->
## Symptom

`task changes` depended on the task filename and could confuse two IDs with a
shared prefix.

<!-- toudocu:section expected-behavior -->
## Expected behavior

The task is selected by the exact stable ID in its H1 in the chosen Git
snapshot. Its filename does not define its identity.

<!-- toudocu:section actual-behavior -->
## Actual behavior

A task whose filename did not contain its ID was not found. A change to
`TASK-X-0010` was also treated as a change to `TASK-X-001`.

<!-- toudocu:section steps-to-reproduce -->
## Steps to reproduce

1. Create a valid work item in `custom-name.md`.
2. Add another work item whose ID shares the same prefix.
3. Run `task changes` for the first ID and inspect the selected contract and
   changes.

<!-- toudocu:section evidence -->
## Evidence

`taskDocumentContent`, `buildTaskImpact`, and `changeRelatedToTask` use
`strings.Contains` on the basename instead of a parsed ID. Correct prior
behavior for an arbitrary filename is not supported, so the regression value
is No.

<!-- toudocu:section cause -->
## Cause

Changes re-derives work-item identity from the filename instead of using the
exact H1 ID from the snapshot document.

<!-- toudocu:section scope -->
## Scope

- `internal/app/changes_git.go`;
- `internal/app/changes_build.go`;
- `internal/app/changes_report.go`;
- `internal/app/changes_types.go`;
- `internal/app/changes_test.go`;
- `docs/work/BUG-CHANGES-003.md`.

<!-- toudocu:section out-of-scope -->
## Out of scope

- renaming existing work items;
- changing stable task IDs;
- building a full ProjectModel for each Git side.

<!-- toudocu:section plan -->
## Plan

1. Find the exact ID from the parsed H1 of every snapshot task document.
2. Preserve the selected task path in private change context.
3. Use the exact path in impact analysis and the task filter.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] `AC-01` The regression test selects a task by exact ID with an arbitrary
  filename.
- [x] `AC-02` A work item whose ID extends the selected ID is excluded from the
  selected task's `TaskChanges`.

<!-- toudocu:section verification -->
## Verification

- `AC-01` → `go test ./internal/app -run TestTaskChangesSelectsExactTaskIDFromHeading`
- `AC-02` → `go test ./internal/app -run TestTaskChangesSelectsExactTaskIDFromHeading`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

<!-- toudocu:section regression-test -->
## Regression test

The Git fixture uses a filename without a task ID and a neighboring ID with a
shared prefix.

<!-- toudocu:section documentation-impact -->
## Documentation impact

Only this historical record changed. The stable-ID rule was already documented.
