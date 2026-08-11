# BUG-SITE-001: Show inline diagnostics only for the current file

- Type: Bug
- Status: Completed
- Severity: Medium
- Priority: High
- Reproducibility: Always
- Regression: No
- Module: MOD-SITE
- Use case: UC-DOCS-03
- Standards: STD-GO-001, STD-DOCS-001
- Last updated: 2026-08-10

## Symptom

CodeMirror underlines diagnostics from other project documents in the current
file.

## Expected behavior

Project diagnostics remain in the shared list and can be navigated to, while
inline markers receive only diagnostics for the current path.

## Actual behavior

All diagnostics are passed to CodeMirror; their line and column are clamped to
the current document's size and become false markers.

## Steps to reproduce

1. Open file A while file B has a diagnostic.
2. Wait for validation.
3. Observe B's marker inside A.

## Evidence

The backend returns project-wide `model.Issues`, and `renderDiagnostics` passes
the whole array to `setDiagnostics` without a path filter. Correct prior
behavior is not supported, so the regression value is No.

## Cause

One array is used both as the project navigation list and as CodeMirror's
file-local lint source.

## Scope

- `web/src/features/editor/`;
- `web/tests/`;
- `internal/site/assets/generated/`;
- `docs/work/BUG-SITE-001.md`.

## Out of scope

- hiding diagnostics from other files in the shared list;
- changing the backend diagnostic schema;
- redesigning the Editor.

## Plan

1. Extract a testable helper for file-local diagnostics.
2. Filter only the CodeMirror input while preserving the shared list.
3. Rebuild the tracked frontend assets.

## Acceptance criteria

- [x] `AC-01` The frontend regression test keeps only diagnostics whose path
  exactly matches the current file in the inline set; diagnostics without a path
  receive no unsupported file association.
- [x] `AC-02` A diagnostic for another path remains in the list but is not sent
  to CodeMirror; the wiring test asserts the filter in `renderDiagnostics`.

## Verification

- `AC-01` → `npm --prefix web test`
- `AC-02` → `npm --prefix web test`
- `ALL` → `npm --prefix web test && go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && npm --prefix web run typecheck && npm --prefix web run build && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

## Regression test

The Node test compiles the TypeScript helper with the pinned esbuild, checks its
result for diagnostics from two paths, and locks in the `renderDiagnostics`
wiring.

## Documentation impact

Only `docs/work/BUG-SITE-001.md` changes; the Editor contract does not change.
