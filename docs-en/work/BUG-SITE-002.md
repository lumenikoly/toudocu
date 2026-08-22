<!-- toudocu
id: BUG-SITE-002
status: done
taskType: bug
severity: medium
priority: high
reproducibility: often
regression: false
module: MOD-SITE
useCase: UC-DOCS-03
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-11
-->

# BUG-SITE-002: Ignore stale Editor responses


<!-- toudocu:section symptom -->
## Symptom

A late validation or preview response for file A could replace the diagnostics
or preview of the file B that was already open.

<!-- toudocu:section expected-behavior -->
## Expected behavior

The Editor applies a response only while its path and request generation are
still current.

<!-- toudocu:section actual-behavior -->
## Actual behavior

After `await`, the browser code did not compare the response with the open file
or check whether a newer request had already completed.

<!-- toudocu:section steps-to-reproduce -->
## Steps to reproduce

1. Start validation or preview for file A.
2. Before the response arrives, open file B or send a newer request.
3. Wait for the old response and observe A's state in B's workspace.

<!-- toudocu:section evidence -->
## Evidence

`validateCurrent` and `updatePreview` applied data immediately after `await`.
There was no request marker or path check. The repository does not show that
the ordering had worked correctly before, so this bug is not marked as a
regression.

<!-- toudocu:section cause -->
## Cause

The frontend does not invalidate validation/preview generations when switching
files and does not compare a completed request with the latest request of the
same kind.

<!-- toudocu:section scope -->
## Scope

- `web/src/features/editor/`;
- `web/tests/`;
- `internal/site/assets/generated/`;
- `docs/work/BUG-SITE-002.md`.

<!-- toudocu:section out-of-scope -->
## Out of scope

- changing the Editor HTTP API;
- canceling server-side model builds;
- changing the save-conflict workflow.

<!-- toudocu:section plan -->
## Plan

1. Introduce separate validation and preview generations.
2. Invalidate them when applying a different file.
3. Check path and generation before changing the UI.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] `AC-01` The frontend regression test rejects a response for an old path.
- [x] `AC-02` An older generation for one path cannot replace a newer one.
- [x] `AC-03` The wiring test asserts the gates in validation and preview
  success/error branches and generation invalidation in `applyFile`.

<!-- toudocu:section verification -->
## Verification

- `AC-01` → `npm --prefix web test`
- `AC-02` → `npm --prefix web test`
- `AC-03` → `npm --prefix web test`
- `ALL` → `npm --prefix web test && go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && npm --prefix web run typecheck && npm --prefix web run build && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

<!-- toudocu:section regression-test -->
## Regression test

The Node test compiles the TypeScript helper, checks a path mismatch, a stale
generation, and a current response, then locks in the wiring of both Editor
workflows.

<!-- toudocu:section documentation-impact -->
## Documentation impact

Only this historical record changed. The documented Editor behavior for the
current file remains the same.
