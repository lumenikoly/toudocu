<!-- toudocu
id: BUG-CHANGES-002
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

# BUG-CHANGES-002: Resolve relative documentation impact


<!-- toudocu:section symptom -->
## Symptom

Task impact does not recognize documentation-impact links written relative to
the task file.

<!-- toudocu:section expected-behavior -->
## Expected behavior

Markdown links are resolved from the task file's directory and matched against
repository-relative paths in the selected Git snapshot.

<!-- toudocu:section actual-behavior -->
## Actual behavior

The links `../modules/site.md` and `../reference/features.md` produce an empty
`declared` value and create a false `undeclared-document-change` when their
targets change.

<!-- toudocu:section steps-to-reproduce -->
## Steps to reproduce

1. Declare documentation impact with a `../modules/site.md` link.
2. Change the linked document.
3. Run `task changes` and inspect the declared/actual diagnostics.

<!-- toudocu:section evidence -->
## Evidence

`task changes TASK-SITE-001 HEAD → HEAD` returned `declared: []` for two
existing relative links. There is no evidence of correct prior behavior, so the
defect is not classified as a regression.

<!-- toudocu:section cause -->
## Cause

Task impact extracts paths with a regular expression, loses the task document's
source path, and unconditionally prepends `docs/` instead of using standard
Markdown link resolution.

<!-- toudocu:section scope -->
## Scope

- `internal/app/changes_build.go`;
- `internal/app/changes_types.go`;
- `internal/app/changes_report.go`;
- `internal/app/changes_test.go`;
- `docs/work/BUG-CHANGES-002.md`.

<!-- toudocu:section out-of-scope -->
## Out of scope

- changing the meaning of task-impact warnings;
- comparing files outside the selected documentation root;
- changing Markdown link policy.

<!-- toudocu:section plan -->
## Plan

1. Preserve the task source path and docs root in snapshot context.
2. Resolve links relative to the task file and enforce the docs-root boundary.
3. Add an end-to-end regression for a declared change.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] `AC-01` The regression test maps `../modules/site.md` to
  `docs/modules/site.md` in the selected snapshot.
- [x] `AC-02` A declared changed document receives no undeclared diagnostic.

<!-- toudocu:section verification -->
## Verification

- `AC-01` → `go test ./internal/app -run TestTaskImpactResolvesRelativeDocumentationLinks`
- `AC-02` → `go test ./internal/app -run TestTaskImpactResolvesRelativeDocumentationLinks`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

<!-- toudocu:section regression-test -->
## Regression test

The Git fixture changes the target of a relative link and checks the declared
entry and the absence of a false warning.

<!-- toudocu:section documentation-impact -->
## Documentation impact

Only `docs/work/BUG-CHANGES-002.md` changes; the existing task impact contract
already requires standard relative Markdown links.
