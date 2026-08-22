<!-- toudocu
id: BUG-SITE-001
status: done
taskType: bug
severity: medium
priority: high
reproducibility: always
regression: false
module: MOD-SITE
useCase: UC-DOCS-03
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-11
-->

# BUG-SITE-001: Show inline diagnostics only for the current file


<!-- toudocu:section symptom -->
## Symptom

CodeMirror underlines diagnostics from other project documents in the current
file.

<!-- toudocu:section expected-behavior -->
## Expected behavior

Project diagnostics remain in the shared list and can be navigated to, while
inline markers receive only diagnostics for the current path.

<!-- toudocu:section actual-behavior -->
## Actual behavior

All diagnostics are passed to CodeMirror; their line and column are clamped to
the current document's size and become false markers.

<!-- toudocu:section steps-to-reproduce -->
## Steps to reproduce

1. Open file A while file B has a diagnostic.
2. Wait for validation.
3. Observe B's marker inside A.

<!-- toudocu:section evidence -->
## Evidence

The backend returns project-wide `model.Issues`, and `renderDiagnostics` passes
the whole array to `setDiagnostics` without a path filter. Correct prior
behavior is not supported, so the regression value is No.

<!-- toudocu:section cause -->
## Cause

One array is used both as the project navigation list and as CodeMirror's
file-local lint source.

<!-- toudocu:section scope -->
## Scope

- `web/src/features/editor/`;
- `web/tests/`;
- `internal/site/assets/generated/`;
- `docs/work/BUG-SITE-001.md`.

<!-- toudocu:section out-of-scope -->
## Out of scope

- hiding diagnostics from other files in the shared list;
- changing the backend diagnostic schema;
- redesigning the Editor.

<!-- toudocu:section plan -->
## Plan

1. Extract a testable helper for file-local diagnostics.
2. Filter only the CodeMirror input while preserving the shared list.
3. Rebuild the tracked frontend assets.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] `AC-01` The frontend regression test keeps only diagnostics whose path
  exactly matches the current file in the inline set; diagnostics without a path
  receive no unsupported file association.
- [x] `AC-02` A diagnostic for another path remains in the list but is not sent
  to CodeMirror; the wiring test asserts the filter in `renderDiagnostics`.

<!-- toudocu:section verification -->
## Verification

- `AC-01` → `npm --prefix web test`
- `AC-02` → `npm --prefix web test`
- `ALL` → `npm --prefix web test && go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && npm --prefix web run typecheck && npm --prefix web run build && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

<!-- toudocu:section regression-test -->
## Regression test

The Node test compiles the TypeScript helper with the pinned esbuild, checks its
result for diagnostics from two paths, and locks in the `renderDiagnostics`
wiring.

<!-- toudocu:section documentation-impact -->
## Documentation impact

Only `docs/work/BUG-SITE-001.md` changes; the Editor contract does not change.
