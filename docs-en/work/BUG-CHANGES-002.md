# BUG-CHANGES-002: Resolve relative documentation impact

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

Task impact does not recognize documentation-impact links written relative to
the task file.

## Expected behavior

Markdown links are resolved from the task file's directory and matched against
repository-relative paths in the selected Git snapshot.

## Actual behavior

The links `../modules/site.md` and `../reference/features.md` produce an empty
`declared` value and create a false `undeclared-document-change` when their
targets change.

## Steps to reproduce

1. Declare documentation impact with a `../modules/site.md` link.
2. Change the linked document.
3. Run `task changes` and inspect the declared/actual diagnostics.

## Evidence

`task changes TASK-SITE-001 HEAD → HEAD` returned `declared: []` for two
existing relative links. There is no evidence of correct prior behavior, so the
defect is not classified as a regression.

## Cause

Task impact extracts paths with a regular expression, loses the task document's
source path, and unconditionally prepends `docs/` instead of using standard
Markdown link resolution.

## Scope

- `internal/app/changes_build.go`;
- `internal/app/changes_types.go`;
- `internal/app/changes_report.go`;
- `internal/app/changes_test.go`;
- `docs/work/BUG-CHANGES-002.md`.

## Out of scope

- changing the meaning of task-impact warnings;
- comparing files outside the selected documentation root;
- changing Markdown link policy.

## Plan

1. Preserve the task source path and docs root in snapshot context.
2. Resolve links relative to the task file and enforce the docs-root boundary.
3. Add an end-to-end regression for a declared change.

## Acceptance criteria

- [x] `AC-01` The regression test maps `../modules/site.md` to
  `docs/modules/site.md` in the selected snapshot.
- [x] `AC-02` A declared changed document receives no undeclared diagnostic.

## Verification

- `AC-01` → `go test ./internal/app -run TestTaskImpactResolvesRelativeDocumentationLinks`
- `AC-02` → `go test ./internal/app -run TestTaskImpactResolvesRelativeDocumentationLinks`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

## Regression test

The Git fixture changes the target of a relative link and checks the declared
entry and the absence of a false warning.

## Documentation impact

Only `docs/work/BUG-CHANGES-002.md` changes; the existing task impact contract
already requires standard relative Markdown links.
