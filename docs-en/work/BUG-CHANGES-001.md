# BUG-CHANGES-001: Preserve Git state for paths containing spaces

- Type: Bug
- Status: Completed
- Severity: Medium
- Priority: High
- Reproducibility: Always
- Regression: No
- Module: MOD-CHANGES
- Use case: UC-DOCS-05
- Owner: Docu-docu Team
- Standards: STD-GO-001, STD-DOCS-001
- Last updated: 2026-08-09

## Symptom

A changed Markdown file whose name contains spaces is present in the change set,
but its `gitState` does not show its staged or unstaged state.

## Expected behavior

The NUL-separated Git path is preserved in full for modified and renamed
records.

## Actual behavior

The path `docs/file with spaces.md` is registered under the `spaces.md` key, so
the subsequent lookup returns an empty `ChangeGitState`.

## Steps to reproduce

1. Commit a Markdown file whose name contains spaces.
2. Modify or rename it and change its staged/unstaged state.
3. Build the Changes report and inspect the full path's `gitState`.

## Evidence

The focused Git fixture returned a map with the `spaces.md` key. Correct prior
behavior for such a path is not supported by tests or history, so this is not a
regression.

## Cause

After NUL splitting, the porcelain v2 record is split again with
`strings.Fields`, and the path is taken from the last whitespace-delimited
token.

## Scope

- `internal/app/changes_git.go`;
- `internal/app/changes_test.go`;
- `docs/work/BUG-CHANGES-001.md`.

## Out of scope

- changing Git revisions or rename similarity;
- changing the public Changes schema;
- changing the source diff.

## Plan

1. Parse the fixed porcelain v2 prefix without splitting the path on whitespace.
2. Verify modified, staged, and renamed paths containing spaces.

## Acceptance criteria

- [x] `AC-01` The regression test preserves staged/unstaged flags for the full
  modified path containing spaces.
- [x] `AC-02` A rename record containing spaces associates Git state with the
  full new path.

## Verification

- `AC-01` → `go test ./internal/app -run TestStatusStatesPreservePathsWithSpaces`
- `AC-02` → `go test ./internal/app -run TestStatusStatesPreservePathsWithSpaces`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/docu-docu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/docu-docu || exit 1; done`

## Regression test

A temporary Git repository covers the unstaged, staged, and renamed states of a
path containing spaces.

## Documentation impact

Only `docs/work/BUG-CHANGES-001.md` changes; the documented Changes contract
remains unchanged.
